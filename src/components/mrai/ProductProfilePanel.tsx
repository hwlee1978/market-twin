"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Package,
  Pencil,
  X as CloseX,
} from "lucide-react";
import { ErrorState, errMsg } from "./ErrorState";

type Profile = {
  workspace_id: string;
  category: string;
  description: string | null;
  visual_features: {
    silhouette?: string;
    materials?: string[];
    colors?: string[];
    distinguishing?: string[];
    typical_angles?: string[];
    logo_visible_on_product?: boolean;
  };
  logo_placement_hints: string[];
  built_from_asset_ids: string[];
  built_at: string | null;
  build_cost_usd: number | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  footwear: "신발",
  apparel: "의류",
  cosmetics: "화장품",
  skincare: "스킨케어",
  fragrance: "향수",
  accessories: "액세서리",
  jewelry: "주얼리",
  electronics: "전자기기",
  home_goods: "홈 용품",
  food_beverage: "식음료",
  health_supplements: "건강기능식품",
  saas_digital: "SaaS / 디지털",
  ip_media: "IP / 콘텐츠",
  other: "기타",
};

export function ProductProfilePanel() {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined); // undefined = loading
  const [expanded, setExpanded] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    const res = await fetch("/api/mrai/product-profile", { cache: "no-store" });
    if (!res.ok) {
      setError("프로필 로드 실패");
      setProfile(null);
      return;
    }
    const { profile: data } = (await res.json()) as { profile: Profile | null };
    setProfile(data);
  };

  useEffect(() => {
    void load();
  }, []);

  const rebuild = async () => {
    setBuilding(true);
    setError(null);
    try {
      const res = await fetch("/api/mrai/product-profile", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.detail ?? json.error ?? "추출 실패");
        return;
      }
      setProfile(json.profile);
      setExpanded(true);
    } catch (e) {
      setError(errMsg(e, "추출 실패"));
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-5 py-4 flex items-start justify-between gap-3 hover:bg-slate-50/50 text-left"
      >
        <div className="flex items-start gap-2">
          <span className="shrink-0 mt-0.5 text-slate-400">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
              <Package className="w-4 h-4 text-violet-600" />
              제품 프로필 (Vision-extracted)
              {profile && profile.built_at && (
                <span className="text-[10px] font-normal text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                  {CATEGORY_LABEL[profile.category] ?? profile.category}
                  {profile.visual_features?.logo_visible_on_product === false &&
                    " · 로고 미표시 제품"}
                </span>
              )}
              {!profile && profile !== undefined && (
                <span className="text-[10px] font-normal text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                  ⚠ 미생성
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              브랜드 자산의 제품 사진들을 Claude Vision으로 분석 → 카테고리/실루엣/소재/색상/로고 위치 자동 추출 → 모든 콘텐츠·이미지 생성이 이걸 정확한 spec으로 사용.
            </p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-5 py-4 border-t border-slate-100 space-y-3">
          {error && <ErrorState title="프로필 오류" description={error} variant="inline" />}

          {profile === undefined && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> 로드 중…
            </div>
          )}

          {profile === null && (
            <div className="text-xs text-slate-500 space-y-3">
              <p>아직 추출된 프로필이 없습니다. 두 가지 경로 중 하나로 만드세요:</p>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-700">
                  🤖 AI 추출 (제품 사진 기반)
                </div>
                <p className="text-slate-600 leading-relaxed">
                  실물 제품이 있는 브랜드 (패션·뷰티·식품·전자기기 등): 브랜드 자산 라이브러리에 제품 사진을 2-5장 업로드 → "AI 추출" 클릭 → Claude Vision 이 카테고리·소재·색상·로고 위치를 자동 추출 (~$0.02-0.05).
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-700">
                  ✏️ 직접 설정 (수동 입력)
                </div>
                <p className="text-slate-600 leading-relaxed">
                  실물 제품 사진이 없는 워크스페이스 (SaaS·디지털 서비스·IP·콘텐츠): 카테고리만 직접 선택하면 됩니다. 카테고리는 Mr.AI 가 크롤 소스 프리셋·SEO 추천·콘텐츠 톤을 정할 때 사용합니다.
                </p>
              </div>
            </div>
          )}

          {profile && (
            <>
              <div className="space-y-2 text-sm">
                {profile.description && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">
                      설명
                    </div>
                    <p className="text-slate-800 leading-snug">{profile.description}</p>
                  </div>
                )}
                {profile.visual_features?.silhouette && (
                  <Row label="실루엣" value={profile.visual_features.silhouette} />
                )}
                {profile.visual_features?.materials && (
                  <Row label="소재" tags={profile.visual_features.materials} />
                )}
                {profile.visual_features?.colors && (
                  <ColorRow colors={profile.visual_features.colors} />
                )}
                {profile.visual_features?.distinguishing && (
                  <Row label="차별 특징" tags={profile.visual_features.distinguishing} />
                )}
                {profile.visual_features?.typical_angles && (
                  <Row label="대표 앵글" tags={profile.visual_features.typical_angles} />
                )}
                {profile.logo_placement_hints.length > 0 ? (
                  <Row label="로고 위치 (Vision 힌트)" tags={profile.logo_placement_hints} />
                ) : (
                  <Row
                    label="로고 위치"
                    value="제품에 로고 노출되지 않음 → 이미지 생성 시 강제 합성 안 함"
                  />
                )}
              </div>
              <div className="text-[10px] text-slate-400">
                {profile.built_at && (
                  <>마지막 추출: {new Date(profile.built_at).toLocaleString("ko-KR")}</>
                )}
                {profile.build_cost_usd != null && (
                  <> · 비용 ${profile.build_cost_usd.toFixed(3)}</>
                )}
                {profile.built_from_asset_ids.length > 0 && (
                  <> · {profile.built_from_asset_ids.length}장의 product 자산 사용</>
                )}
              </div>
            </>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={rebuild}
              disabled={building}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-medium hover:opacity-90 disabled:opacity-60"
            >
              {building ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {building ? "추출 중… (15-30초)" : profile ? "🔄 재추출" : "🤖 AI 추출"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={building}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-60"
            >
              <Pencil className="w-3.5 h-3.5" />
              {profile ? "편집" : "✏️ 직접 설정"}
            </button>
          </div>
        </div>
      )}

      {editing && (
        <ProfileEditModal
          initial={profile && profile !== undefined ? profile : null}
          onClose={() => setEditing(false)}
          onSaved={(p) => {
            setEditing(false);
            setProfile(p);
            setExpanded(true);
          }}
        />
      )}
    </div>
  );
}

const CATEGORY_OPTIONS: Array<{
  value: string;
  label: string;
  hint: string;
}> = [
  { value: "footwear", label: "신발 (Footwear)", hint: "스니커즈·러닝화·드레스슈즈 등" },
  { value: "apparel", label: "의류 (Apparel)", hint: "티셔츠·아우터·데님·이너웨어 등" },
  { value: "cosmetics", label: "화장품 (Cosmetics)", hint: "메이크업·립·아이 메이크업 등" },
  { value: "skincare", label: "스킨케어 (Skincare)", hint: "세럼·크림·토너·선스크린 등" },
  { value: "fragrance", label: "향수 (Fragrance)", hint: "퍼퓸·룸 스프레이·캔들 등" },
  { value: "accessories", label: "액세서리 (Accessories)", hint: "가방·모자·스카프·벨트 등" },
  { value: "jewelry", label: "주얼리 (Jewelry)", hint: "반지·목걸이·귀걸이·시계 등" },
  { value: "electronics", label: "전자기기 (Electronics)", hint: "스마트폰·노트북·가전·오디오 등" },
  { value: "home_goods", label: "홈 용품 (Home goods)", hint: "주방용품·인테리어·생활용품 등" },
  { value: "food_beverage", label: "식음료 (Food / Beverage)", hint: "스낵·음료·라면·건강식품 등" },
  { value: "health_supplements", label: "건강기능식품 (Health supplements)", hint: "비타민·프로바이오틱스·단백질 등" },
  { value: "saas_digital", label: "SaaS / 디지털 서비스", hint: "B2B·B2C SaaS·앱·디지털 콘텐츠 구독" },
  { value: "ip_media", label: "IP / 콘텐츠", hint: "웹툰·캐릭터·게임·엔터테인먼트 IP" },
  { value: "other", label: "기타 (Other)", hint: "위에 해당하지 않는 제품·서비스" },
];

function ProfileEditModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Profile | null;
  onClose: () => void;
  onSaved: (p: Profile) => void;
}) {
  const [category, setCategory] = useState(initial?.category ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!category) {
      setErr("카테고리를 선택해주세요.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/mrai/product-profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category,
          description: description.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.detail ?? json.error ?? "저장 실패");
        return;
      }
      onSaved(json.profile as Profile);
    } catch (e) {
      setErr(errMsg(e, "네트워크 오류"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">
            제품 프로필 직접 설정
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
          >
            <CloseX className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2.5 text-[11px] text-slate-600 leading-relaxed">
            카테고리는 Mr.AI 가 크롤 소스 프리셋·SEO 추천·콘텐츠 톤을 결정할 때 핵심 컨텍스트로 사용합니다. 잘못 고르면 무관한 경쟁사·트렌드가 노출될 수 있으니 신중히 선택하세요.
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              카테고리 *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 text-sm"
            >
              <option value="">— 카테고리 선택 —</option>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} · {o.hint}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              설명 (선택, 0-2000자)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="제품·서비스의 핵심 가치, 타겟 고객, 차별점 등을 간략히 (예: '타겟 세그먼트 + 제품 정의 + 가장 강력한 기술·소재·기능 한 줄')"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 text-sm placeholder:text-slate-400 resize-none"
            />
            <div className="text-[10px] text-slate-400 mt-1">
              Mr.AI 가 SEO·콘텐츠 생성 시 컨텍스트로 사용. 비어두면 워크스페이스 메모리에서 자동 추론.
            </div>
          </div>

          {err && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1.5 rounded">
              {err}
            </p>
          )}
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
            disabled={busy || !category}
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

function ColorRow({ colors }: { colors: string[] }) {
  // Match optional "(#XXXXXX)" — accept 3 or 6 hex chars.
  const HEX_RE = /\(?\s*(#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3}))\s*\)?/;
  const parsed = colors.map((c) => {
    const m = c.match(HEX_RE);
    return {
      hex: m ? m[1] : null,
      // Strip the hex portion + surrounding parens/space from label
      label: m ? c.replace(HEX_RE, "").trim() : c,
      raw: c,
    };
  });
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">색상</div>
      <div className="flex flex-wrap gap-1.5">
        {parsed.map((p, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded"
            title={p.raw}
          >
            {p.hex && (
              <span
                className="inline-block w-3 h-3 rounded-sm border border-slate-300 shrink-0"
                style={{ backgroundColor: p.hex }}
              />
            )}
            <span>{p.label || "(unnamed)"}</span>
            {p.hex && (
              <span className="text-slate-400 font-mono text-[10px]">{p.hex.toUpperCase()}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tags,
}: {
  label: string;
  value?: string;
  tags?: string[];
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</div>
      {value && <p className="text-slate-700 text-xs leading-snug">{value}</p>}
      {tags && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t, i) => (
            <span key={i} className="text-[11px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
