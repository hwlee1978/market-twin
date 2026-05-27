import { notFound } from "next/navigation";
import { MRAI_ENABLED } from "@/lib/mrai/enabled";

/**
 * Mr.AI feature-gate layout.
 *
 * NEXT_PUBLIC_MRAI_ENABLED controls whether the Mr.AI feature surface
 * is available. On the MarketTwin (markettwin.ai) production
 * deployment this is false → notFound() on every /mr-ai/* page. On
 * the Mr.AI beta deployment it's true and children render normally.
 *
 * One central gate beats sprinkling guards in every page.
 */
export default function MrAILayout({ children }: { children: React.ReactNode }) {
  if (!MRAI_ENABLED) {
    notFound();
  }
  return <>{children}</>;
}
