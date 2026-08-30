import { requireUser } from "@/lib/session";
import { listExpenses } from "@/lib/expenses";
import { monthSummary } from "@/lib/format";
import { AddExpenseForm } from "@/components/AddExpenseForm";
import { ExpensesView } from "@/components/ExpensesView";

export default async function ExpensesPage({
  searchParams
}: {
  searchParams: Promise<{ category?: string; range?: string; page?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  // The month summary is filter-independent, so it stays server-computed.
  // Filtering and pagination run in ExpensesView, on this same list — no
  // round-trip per interaction. searchParams only seeds the initial state,
  // so a shared link still opens already filtered.
  const expenses = await listExpenses(user.id);
  const summary = monthSummary(expenses);

  const initialPage = Math.max(1, Math.floor(Number(params.page)) || 1);

  return (
    <>
      <AddExpenseForm />
      <ExpensesView
        expenses={expenses}
        summary={summary}
        initialCategory={params.category || "All"}
        initialRange={params.range || "Last 7 days"}
        initialPage={initialPage}
      />
    </>
  );
}
