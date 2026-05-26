"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, ChevronDown, ChevronRight, Package } from "lucide-react";

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
      setError(e instanceof Error ? e.message : "추출 실패");
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
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1.5 rounded">
              {error}
            </p>
          )}

          {profile === undefined && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> 로드 중…
            </div>
          )}

          {profile === null && (
            <div className="text-xs text-slate-500 space-y-2">
              <p>아직 추출된 프로필이 없습니다.</p>
              <p>
                1. 브랜드 자산 라이브러리에 <strong>제품 사진을 2-5장 업로드</strong>
                <br />
                2. 아래 "AI 추출" 버튼 클릭 → Claude Vision이 제품을 분석 (~$0.02-0.05)
                <br />
                3. 모든 이미지/카피 생성이 이 프로필을 정확한 spec으로 활용
              </p>
            </div>
          )}

          {profile && (
            <>
              <div className="space-y-2 text-sm">
                {profile.description && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">
                      Description
                    </div>
                    <p className="text-slate-800 leading-snug">{profile.description}</p>
                  </div>
                )}
                {profile.visual_features?.silhouette && (
                  <Row label="Silhouette" value={profile.visual_features.silhouette} />
                )}
                {profile.visual_features?.materials && (
                  <Row label="Materials" tags={profile.visual_features.materials} />
                )}
                {profile.visual_features?.colors && (
                  <Row label="Colors" tags={profile.visual_features.colors} />
                )}
                {profile.visual_features?.distinguishing && (
                  <Row label="Distinguishing" tags={profile.visual_features.distinguishing} />
                )}
                {profile.visual_features?.typical_angles && (
                  <Row label="Typical angles" tags={profile.visual_features.typical_angles} />
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
        </div>
      )}
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
