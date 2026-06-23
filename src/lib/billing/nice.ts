/**
 * 나이스페이먼츠 (NICE Payments) V2 신모듈 client. KRW 정기결제를 빌키(bid)
 * 흐름으로 처리한다:
 *
 *   1. 빌키발급으로 카드 → bid 매핑:
 *      - 결제창(SDK): NICE 결제창에서 카드 인증 → bid  (PCI 안전; 화면
 *        「빌링-카드인증」 옵션 사용 가능 여부는 NICE 확인 대기)
 *      - 키인(REST): card 필드 → AES 암호화 → POST /v1/subscribe/regist
 *   2. bid 저장 후 첫 주기 즉시 과금, 갱신마다 chargeBillingKey 호출
 *   3. NICE는 자동갱신이 없으므로 스케줄러(cron)가 매 주기 호출
 *
 * Docs: https://github.com/nicepayments/nicepay-manual/blob/main/api/payment-subscribe.md
 * 인증: HTTP Basic, credentials = base64("clientId:secretKey").
 * 키인 카드정보는 AES-128/ECB(secretKey 앞 16자 key, hex).
 * 샌드박스: NICE_API_BASE=https://sandbox-api.nicepay.co.kr (미설정 시 운영계).
 */

import crypto from "crypto";
import type { PlanSlug } from "./plans";

const NICE_API_BASE = process.env.NICE_API_BASE ?? "https://api.nicepay.co.kr";

interface NiceErrorBody {
  resultCode?: string;
  resultMsg?: string;
}

class NiceError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(`[nice ${status}] ${code}: ${message}`);
    this.name = "NiceError";
    this.code = code;
    this.status = status;
  }
}

function niceClientId(): string {
  const v = process.env.NICE_CLIENT_ID;
  if (!v) throw new Error("NICE_CLIENT_ID is not set.");
  return v;
}

function niceSecretKey(): string {
  const v = process.env.NICE_SECRET_KEY;
  if (!v) throw new Error("NICE_SECRET_KEY is not set.");
  return v;
}

function niceAuthHeader(): string {
  const token = Buffer.from(`${niceClientId()}:${niceSecretKey()}`).toString("base64");
  return `Basic ${token}`;
}

/** 결제창(SDK) clientId — 프론트 AUTHNICE.requestPay에 넘기는 공개값. */
export function nicePublicClientId(): string {
  return niceClientId();
}

/**
 * AES-128/ECB encrypt card plaintext (키인 빌키발급용).
 * Key = secretKey 앞 16자. Output = hex (NICE 기본 A2 모드).
 */
function encryptCardData(plain: string): string {
  const key = niceSecretKey().slice(0, 16);
  const cipher = crypto.createCipheriv("aes-128-ecb", Buffer.from(key, "utf8"), null);
  return cipher.update(plain, "utf8", "hex") + cipher.final("hex");
}

/** signData for 빌키발급(regist): hex(sha256(orderId + ediDate + SecretKey)). */
function registSignData(orderId: string, ediDate: string): string {
  return crypto
    .createHash("sha256")
    .update(`${orderId}${ediDate}${niceSecretKey()}`)
    .digest("hex");
}

/** signData for 빌키승인: hex(sha256(orderId + bid + ediDate + SecretKey)). */
function chargeSignData(orderId: string, bid: string, ediDate: string): string {
  return crypto
    .createHash("sha256")
    .update(`${orderId}${bid}${ediDate}${niceSecretKey()}`)
    .digest("hex");
}

/** signData for 결제취소(환불): hex(sha256(tid + ediDate + SecretKey)). (취소는 amount 미포함) */
function cancelSignData(tid: string, ediDate: string): string {
  return crypto
    .createHash("sha256")
    .update(`${tid}${ediDate}${niceSecretKey()}`)
    .digest("hex");
}

/** signData for 결제승인(결제창 단건): hex(sha256(tid + amount + ediDate + SecretKey)). */
function paymentSignData(tid: string, amount: number, ediDate: string): string {
  return crypto
    .createHash("sha256")
    .update(`${tid}${amount}${ediDate}${niceSecretKey()}`)
    .digest("hex");
}

/** 동일 길이 hex 문자열 상수시간 비교. */
function safeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function niceRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${NICE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: niceAuthHeader(),
      "Content-Type": "application/json;charset=utf-8",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { resultCode: "INVALID_RESPONSE", resultMsg: text };
  }

  // NICE는 비즈니스 실패도 HTTP 200으로 주고 resultCode("0000"=성공)에 담는다.
  const data = (json ?? {}) as NiceErrorBody & Record<string, unknown>;
  if (!res.ok) {
    throw new NiceError(res.status, data.resultCode ?? "UNKNOWN", data.resultMsg ?? "NICE API error");
  }
  if (data.resultCode && data.resultCode !== "0000") {
    throw new NiceError(200, data.resultCode, data.resultMsg ?? "NICE business error");
  }
  return json as T;
}

/**
 * 키인(REST) 빌키발급. 카드 필드를 AES 암호화해 /v1/subscribe/regist 호출.
 * NOTE: 카드번호가 우리 서버를 거치므로 PCI-DSS 범위가 커진다. 결제창
 * 빌키발급이 가능하면 그쪽을 우선. 이 헬퍼는 키인 폴백용.
 */
export async function registBillingKey(opts: {
  card: { cardNo: string; expYear: string; expMonth: string; idNo: string; cardPw: string };
  orderId: string;
  buyerName?: string;
  buyerEmail?: string;
}): Promise<{ bid: string; tid: string; cardCode?: string; cardName?: string }> {
  const c = opts.card;
  const plain = `cardNo=${c.cardNo}&expYear=${c.expYear}&expMonth=${c.expMonth}&idNo=${c.idNo}&cardPw=${c.cardPw}`;
  const encData = encryptCardData(plain);
  const ediDate = new Date().toISOString();
  const signData = registSignData(opts.orderId, ediDate);
  type Resp = { resultCode: string; resultMsg: string; bid: string; tid: string; cardCode?: string; cardName?: string };
  const data = await niceRequest<Resp>("POST", "/v1/subscribe/regist", {
    encData,
    orderId: opts.orderId,
    encMode: "A2", // A2 = AES-128/ECB/hex
    ediDate,
    signData,
    buyerName: opts.buyerName,
    buyerEmail: opts.buyerEmail,
  });
  return { bid: data.bid, tid: data.tid, cardCode: data.cardCode, cardName: data.cardName };
}

/**
 * 저장된 bid로 과금. 첫 결제·갱신 공통. orderId는 결제마다 unique여야
 * 재시도 중복과금을 막는다.
 */
export async function chargeBillingKey(opts: {
  bid: string;
  amountKrw: number;
  orderId: string;
  goodsName: string;
  buyerName?: string;
  buyerEmail?: string;
}): Promise<{ tid: string; status: string; amount: number; paidAt?: string }> {
  const ediDate = new Date().toISOString();
  const signData = chargeSignData(opts.orderId, opts.bid, ediDate);
  type Resp = { resultCode: string; resultMsg: string; tid: string; status: string; amount: number; paidAt?: string };
  const data = await niceRequest<Resp>("POST", `/v1/subscribe/${opts.bid}/payments`, {
    orderId: opts.orderId,
    amount: opts.amountKrw,
    goodsName: opts.goodsName,
    cardQuota: "0", // 일시불
    useShopInterest: false, // 매뉴얼: false만 사용 가능
    ediDate,
    signData,
    buyerName: opts.buyerName,
    buyerEmail: opts.buyerEmail,
  });
  return { tid: data.tid, status: data.status, amount: data.amount, paidAt: data.paidAt };
}

/** bid 삭제(만료). 구독 해지 teardown. */
export async function expireBillingKey(opts: { bid: string; orderId: string }): Promise<void> {
  await niceRequest("POST", `/v1/subscribe/${opts.bid}/expire`, { orderId: opts.orderId });
}

/**
 * 결제창 단건결제 인증결과 위변조 검증.
 * NICE가 returnUrl로 POST한 signature = hex(sha256(authToken + clientId +
 * amount + SecretKey))를 우리 키로 재계산해 상수시간 비교한다.
 * amount는 NICE가 서명한 값이므로, 이 검증 통과 = 금액 무결성 보장.
 */
export function verifyAuthSignature(opts: {
  authToken: string;
  amount: number | string;
  signature: string;
}): boolean {
  const expected = crypto
    .createHash("sha256")
    .update(`${opts.authToken}${niceClientId()}${opts.amount}${niceSecretKey()}`)
    .digest("hex");
  return safeHexEqual(expected, opts.signature);
}

/**
 * 결제창 단건결제 최종 승인. 인증(결제창)으로 받은 tid를 금액과 함께
 * /v1/payments/{tid}에 보내 실제 매출(승인)을 일으킨다. 빌키 없는 1회성
 * 결제라 저장할 bid가 없고, current_period_end로 기간 접근만 부여한다.
 */
export async function approvePayment(opts: {
  tid: string;
  amountKrw: number;
}): Promise<{ tid: string; orderId?: string; status?: string; amount: number; paidAt?: string }> {
  const ediDate = new Date().toISOString();
  const signData = paymentSignData(opts.tid, opts.amountKrw, ediDate);
  type Resp = {
    resultCode: string;
    resultMsg: string;
    tid: string;
    orderId?: string;
    status?: string;
    amount: number;
    paidAt?: string;
  };
  const data = await niceRequest<Resp>("POST", `/v1/payments/${opts.tid}`, {
    amount: opts.amountKrw,
    ediDate,
    signData,
    returnCharSet: "utf-8",
  });
  return { tid: data.tid, orderId: data.orderId, status: data.status, amount: data.amount, paidAt: data.paidAt };
}

/**
 * 결제취소(환불). 승인된 거래(tid)를 취소한다. cancelAmtKrw 생략 시 전액취소,
 * 지정 시 부분취소(카드는 부분취소 가능). orderId는 취소건 고유번호로 매번
 * unique해야 한다(중복 재호출 불가). 7일 내 미사용 전액환불(청약철회) 등에 사용.
 */
export async function cancelPayment(opts: {
  tid: string;
  reason: string;
  orderId: string;
  cancelAmtKrw?: number;
}): Promise<{ cancelledTid?: string; status?: string; cancelledAt?: string; balanceAmt?: number }> {
  const ediDate = new Date().toISOString();
  const signData = cancelSignData(opts.tid, ediDate);
  type Resp = {
    resultCode: string;
    resultMsg: string;
    tid: string;
    cancelledTid?: string;
    status?: string;
    cancelledAt?: string;
    balanceAmt?: number;
  };
  const data = await niceRequest<Resp>("POST", `/v1/payments/${opts.tid}/cancel`, {
    reason: opts.reason,
    orderId: opts.orderId,
    ediDate,
    signData,
    returnCharSet: "utf-8",
    // cancelAmt 생략 = 전액취소. 부분취소 시에만 포함.
    ...(opts.cancelAmtKrw != null ? { cancelAmt: opts.cancelAmtKrw } : {}),
  });
  return {
    cancelledTid: data.cancelledTid,
    status: data.status,
    cancelledAt: data.cancelledAt,
    balanceAmt: data.balanceAmt,
  };
}

/**
 * KRW price for a given plan/cycle. plans.ts는 KRW×100 저장이므로 ÷100.
 * annual = monthly × 10.
 */
export function nicePriceKrw(plan: PlanSlug, cycle: "monthly" | "annual"): number | null {
  const monthly: Record<PlanSlug, number | null> = {
    free_trial: null,
    starter: 500000,
    validator: 1500000,
    growth: 3500000,
    enterprise: null,
  };
  const m = monthly[plan];
  if (m == null) return null;
  return cycle === "annual" ? m * 10 : m;
}

export { NiceError };
