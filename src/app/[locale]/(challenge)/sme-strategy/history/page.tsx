import { History } from "lucide-react";
import { ContentHistoryPanel } from "@/components/challenge/ContentHistoryPanel";

export const dynamic = "force-dynamic";

/**
 * 최근 생성한 Task 2 콘텐츠 목록 (최대 20개). 각 항목 클릭 시
 * /sme-strategy/content?hash=… 로 이동해 동일 결과 즉시 복원.
 * 비인증 demo workspace 도 본인 generation history 표시.
 */
export default function ContentHistoryPage() {
  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8">
      <header className="mb-6">
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase rounded mb-2">
          History
        </div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <History className="w-6 h-6 text-slate-600" />
          최근 생성한 콘텐츠
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          영구 저장된 콘텐츠 생성물 최대 <strong>20개</strong>. 각 결과는 URL 영구 link로 보존되며 동일 입력에 대한 재생성은 LLM 호출 없이 즉시 반환됩니다.
        </p>
      </header>

      <ContentHistoryPanel />
    </div>
  );
}
