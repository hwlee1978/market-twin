/**
 * NICE 결제창 단건결제 — 서명/검증 로직 스모크 테스트.
 *
 * 실 결제(운영키·계약)는 바로오픈 후에만 가능하므로, 그 전에 네트워크 없이
 * 검증할 수 있는 보안 핵심 로직만 단위로 점검한다:
 *   - verifyAuthSignature: 결제창 인증결과 위변조 검증
 *     (hex(sha256(authToken + clientId + amount + SecretKey)))
 *   - return 라우트의 금액 무결성 게이트(서명 통과 + 주문금액 일치)
 *   - nicePriceKrw 가격표
 *
 * 실행: npx tsx scripts/nice-single-smoke.ts
 * 종료코드: 실패가 하나라도 있으면 1.
 */

import { createHash } from "node:crypto";

// verifyAuthSignature/niceClientId가 호출 시점에 env를 읽으므로 import 전에 세팅.
const TEST_CLIENT_ID = "test_client_id_0123456789abcdef";
const TEST_SECRET_KEY = "test_secret_key_0123456789abcdef"; // 32자(AES-128 key 앞16자 사용)
process.env.NICE_CLIENT_ID = TEST_CLIENT_ID;
process.env.NICE_SECRET_KEY = TEST_SECRET_KEY;

import { verifyAuthSignature, nicePriceKrw, niceSupplyKrw } from "../src/lib/billing/nice";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

/** NICE가 returnUrl로 돌려보내는 정상 signature를 동일 규칙으로 생성. */
function makeAuthSig(authToken: string, amount: number | string, secret = TEST_SECRET_KEY, clientId = TEST_CLIENT_ID): string {
  return createHash("sha256").update(`${authToken}${clientId}${amount}${secret}`).digest("hex");
}

console.log("verifyAuthSignature:");
{
  const authToken = "authtoken-abc123";
  const amount = 500000;
  const sig = makeAuthSig(authToken, amount);

  check("정상 서명 통과(amount: number)", verifyAuthSignature({ authToken, amount, signature: sig }) === true);
  check(
    "정상 서명 통과(amount: string, NICE는 문자열로 보냄)",
    verifyAuthSignature({ authToken, amount: String(amount), signature: sig }) === true,
  );
  check("서명 위조 거부", verifyAuthSignature({ authToken, amount, signature: sig.replace(/.$/, "0") }) === false);
  check(
    "금액 위조 거부(서명은 그대로, amount만 낮춤)",
    verifyAuthSignature({ authToken, amount: 1000, signature: sig }) === false,
  );
  check(
    "다른 가맹(secret 불일치) 서명 거부",
    verifyAuthSignature({ authToken, amount, signature: makeAuthSig(authToken, amount, "someone-elses-secret-key-xxxxxx") }) === false,
  );
  check("authToken 변조 거부", verifyAuthSignature({ authToken: "tampered", amount, signature: sig }) === false);
  check("빈 서명 거부", verifyAuthSignature({ authToken, amount, signature: "" }) === false);
}

// return 라우트의 실제 게이트를 재현: (1) 서명 검증 (2) 주문금액 일치.
// 둘 다 통과해야 승인으로 넘어간다.
console.log("checkout/return 금액 무결성 게이트:");
{
  const order = { amount_krw: 1500000 }; // 우리가 적재한 주문 금액(Validator)
  function returnGate(niceAmountStr: string, signature: string, authToken: string): "approve" | "reject" {
    const amount = Number(niceAmountStr);
    if (!Number.isFinite(amount) || amount !== order.amount_krw) return "reject";
    if (!verifyAuthSignature({ authToken, amount, signature })) return "reject";
    return "approve";
  }
  const authToken = "tok-xyz";
  const goodSig = makeAuthSig(authToken, order.amount_krw);

  check("정상 결제 승인", returnGate("1500000", goodSig, authToken) === "approve");
  check(
    "금액 끌어내림 공격 거부(주문 150만 → 통보 1천)",
    returnGate("1000", makeAuthSig(authToken, 1000), authToken) === "reject",
  );
  check("서명만 통과해도 주문금액 불일치면 거부", returnGate("999999", makeAuthSig(authToken, 999999), authToken) === "reject");
  check("숫자 아닌 amount 거부", returnGate("abc", goodSig, authToken) === "reject");
}

console.log("niceSupplyKrw (공급가, 부가세 별도):");
{
  check("starter monthly 공급가 = 500,000", niceSupplyKrw("starter", "monthly") === 500000);
  check("starter annual 공급가 = ×10 (5,000,000)", niceSupplyKrw("starter", "annual") === 5000000);
  check("validator monthly 공급가 = 1,500,000", niceSupplyKrw("validator", "monthly") === 1500000);
}

console.log("nicePriceKrw (청구가, 부가세 10% 포함):");
{
  check("starter monthly 청구 = 550,000", nicePriceKrw("starter", "monthly") === 550000);
  check("starter annual 청구 = 5,500,000", nicePriceKrw("starter", "annual") === 5500000);
  check("validator monthly 청구 = 1,650,000", nicePriceKrw("validator", "monthly") === 1650000);
  check("growth annual 청구 = 38,500,000", nicePriceKrw("growth", "annual") === 38500000);
  check("청구 = 공급가 × 1.1", nicePriceKrw("growth", "monthly") === Math.round((niceSupplyKrw("growth", "monthly") as number) * 1.1));
  check("free_trial = null(가격 없음)", nicePriceKrw("free_trial", "monthly") === null);
  check("enterprise = null(별도 견적)", nicePriceKrw("enterprise", "monthly") === null);
}

console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
