import { requireUser } from "@/lib/session";
import { InsightsPanel } from "@/components/InsightsPanel";

export default async function InsightsPage() {
  await requireUser();
  return <InsightsPanel />;
}
