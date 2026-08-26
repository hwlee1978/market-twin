export interface AudienceSegment {
  label: string;
  sharePct: number;
  from: string;
  to: string;
  textColor: string;
}

export interface ArchetypeCard {
  id: "champion" | "curious" | "conditional" | "skeptic" | "walker";
  sharePct: number;
  quote: string | null;
  dotColor: string;
}

const ARCHETYPE_LABEL: Record<ArchetypeCard["id"], { ko: string; en: string }> = {
  champion: { ko: "챔피언", en: "Champion" },
  curious: { ko: "호기심형", en: "Curious" },
  conditional: { ko: "조건부", en: "Conditional" },
  skeptic: { ko: "회의형", en: "Skeptic" },
  walker: { ko: "이탈형", en: "Walker" },
};

export function TargetAudience({
  locale,
  totalPersonas,
  segments,
  archetypes,
}: {
  locale: string;
  totalPersonas: number | null;
  segments: AudienceSegment[];
  archetypes: ArchetypeCard[];
}) {
  const isKo = locale === "ko";
  const S = isKo
    ? { eyebrow: "타깃 오디언스", title: "가장 반응한 소비자군", personas: (n: number) => `${n} 페르소나`, noQuote: "대표 인용구 없음" }
    : { eyebrow: "Target audience", title: "Most responsive segments", personas: (n: number) => `${n} personas`, noQuote: "No representative quote" };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[11px] font-extrabold tracking-[.1em] uppercase text-slate-400">
            {S.eyebrow}
          </div>
          <h2 className="text-[15.5px] font-extrabold text-slate-900 mt-0.5">{S.title}</h2>
        </div>
        {totalPersonas != null && (
          <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-violet-50 text-violet-600 shrink-0">
            {S.personas(totalPersonas)}
          </span>
        )}
      </div>

      {segments.map((seg) => (
        <div key={seg.label} className="mb-3.5 last:mb-0">
          <div className="flex items-center justify-between text-[12.5px] mb-1.5">
            <b className="font-bold text-slate-900">{seg.label}</b>
            <span className="font-extrabold tabular-nums" style={{ color: seg.textColor }}>
              {Math.round(seg.sharePct)}%
            </span>
          </div>
          <div className="h-[9px] rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(0, Math.min(100, seg.sharePct))}%`,
                background: `linear-gradient(90deg,${seg.from},${seg.to})`,
              }}
            />
          </div>
        </div>
      ))}

      {archetypes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-[18px]">
          {archetypes.map((a) => (
            <div key={a.id} className="border border-slate-200 rounded-[13px] p-3 bg-slate-50">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="w-[9px] h-[9px] rounded-full shrink-0"
                  style={{ background: a.dotColor }}
                />
                <span className="text-[12.5px] font-extrabold text-slate-900">
                  {isKo ? ARCHETYPE_LABEL[a.id].ko : ARCHETYPE_LABEL[a.id].en}
                </span>
                <span className="ml-auto text-xs font-extrabold text-slate-600 tabular-nums">
                  {Math.round(a.sharePct)}%
                </span>
              </div>
              <div className="text-[11px] text-slate-400 italic leading-[1.45]">
                {a.quote ? `"${a.quote}"` : S.noQuote}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
