"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2, X as CloseX } from "lucide-react";

const COUNTRY_OPTIONS = [
  { code: "KR", label: "한국" },
  { code: "US", label: "미국" },
  { code: "JP", label: "일본" },
  { code: "TW", label: "대만" },
  { code: "CN", label: "중국" },
  { code: "VN", label: "베트남" },
  { code: "TH", label: "태국" },
  { code: "ID", label: "인도네시아" },
  { code: "SG", label: "싱가포르" },
  { code: "GB", label: "영국" },
  { code: "DE", label: "독일" },
  { code: "FR", label: "프랑스" },
];

export function ChannelEditButton({
  channel,
}: {
  channel: {
    id: string;
    display_name: string | null;
    market_country: string | null;
    target_segments: string[];
    posting_style: string | null;
    bio_text: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900"
        title="채널 정보 편집"
      >
        <Pencil className="w-3 h-3" /> 편집
      </button>
      {open && <EditModal channel={channel} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditModal({
  channel,
  onClose,
}: {
  channel: {
    id: string;
    display_name: string | null;
    market_country: string | null;
    target_segments: string[];
    posting_style: string | null;
    bio_text: string | null;
  };
  onClose: () => void;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(channel.display_name ?? "");
  const [marketCountry, setMarketCountry] = useState(channel.market_country ?? "");
  const [segmentsText, setSegmentsText] = useState(
    (channel.target_segments ?? []).join("\n"),
  );
  const [postingStyle, setPostingStyle] = useState(channel.posting_style ?? "");
  const [bioText, setBioText] = useState(channel.bio_text ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const targetSegments = segmentsText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12);
      const res = await fetch(`/api/mrai/marketing-channels/${channel.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          marketCountry: marketCountry || null,
          targetSegments,
          postingStyle: postingStyle.trim() || null,
          bioText: bioText.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail ?? json.error ?? "저장 실패");
      onClose();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 실패");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
    >
      <div
        className="bg-white rounded-xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">채널 정보 편집</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
          >
            <CloseX className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                표시명
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="자사 공식"
                className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                타겟 시장
              </label>
              <select
                value={marketCountry}
                onChange={(e) => setMarketCountry(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900"
              >
                <option value="">(미지정)</option>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              계정 Bio
            </label>
            <textarea
              value={bioText}
              onChange={(e) => setBioText(e.target.value)}
              rows={3}
              placeholder="채널 프로필에 표시되는 자기소개 (max 500자)"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 resize-y"
            />
            <p className="text-[10px] text-slate-400 mt-0.5">
              {bioText.length}/500 · 줄바꿈은 그대로 가상 IG/X 프리뷰에 반영
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              타겟 세그먼트 (한 줄에 하나씩, 최대 12개)
            </label>
            <textarea
              value={segmentsText}
              onChange={(e) => setSegmentsText(e.target.value)}
              rows={4}
              placeholder="25-39세 도시 직장인&#10;프리미엄 가격대 수용&#10;K-fashion 관심"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 resize-y font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              포스팅 톤/스타일
            </label>
            <textarea
              value={postingStyle}
              onChange={(e) => setPostingStyle(e.target.value)}
              rows={4}
              placeholder="캐러셀 5-7컷: 후크 + 디테일 + 가격 카드. 화-목-일 21시 GMT+8."
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 resize-y"
            />
            <p className="text-[10px] text-slate-400 mt-0.5">
              {postingStyle.length}/500 · 콘텐츠 드래프터와 시뮬레이션이 이 톤을 따릅니다
            </p>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-sm px-3 py-1.5 rounded-md hover:bg-slate-800 disabled:opacity-60"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
