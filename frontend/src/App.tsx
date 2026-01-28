import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  addExpense,
  deleteExpense,
  getCurrentUser,
  getExpenses,
  getGoogleAuthUrl,
  getInsights,
  logout,
  signIn,
  signUp,
  updateExpense
} from "./api";
import { AuthCard } from "./components/AuthCard";
import { CategorySelect } from "./components/CategorySelect";
import { ExpenseTable } from "./components/ExpenseTable";
import type { ChatMessage, Expense, User } from "./types";
import { APP_LOGO, APP_NAME } from "./branding";

const categories = ["All", "Food", "Transport", "Shopping", "Subscription", "Other"];
const rangePresetOptions = ["Last 7 days", "Last 30 days", "Last 365 days"];

function formatIDR(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0
  }).format(value);
}

export default function App() {
  // Add expense form
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [notes, setNotes] = useState("");

  // Data
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [expensesError, setExpensesError] = useState("");

  // Filters
  const [filterCategory, setFilterCategory] = useState("All");
  const [rangePreset, setRangePreset] = useState<
    "Last 7 days" | "Last 30 days" | "Last year"
  >("Last 7 days");
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [viewTarget, setViewTarget] = useState<Expense | null>(null);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("Food");
  const [editNotes, setEditNotes] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [view, setView] = useState<"expenses" | "insights">("expenses");
  const [insightMonth, setInsightMonth] = useState(() => {
    const now = new Date();
    return now.getMonth() + 1;
  });
  const [insightYear, setInsightYear] = useState(() => new Date().getFullYear());
  const defaultInsightPrompt = "give me insights about my expenses";
  const [insightPrompt, setInsightPrompt] = useState(defaultInsightPrompt);
  const [insightMessages, setInsightMessages] = useState<ChatMessage[]>([]);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");
  const [insightRemaining, setInsightRemaining] = useState<number | null>(null);
  const [lastSentIndex, setLastSentIndex] = useState<number | null>(null);

  async function loadData() {
    if (!user) return;
    setExpensesError("");
    try {
      setExpenses(await getExpenses());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load expenses";
      setExpensesError(message);
      const status = (err as { status?: unknown })?.status;
      if (status === 401) {
        setUser(null);
      }
    }
  }

  useEffect(() => {
    async function loadUser() {
      try {
        const current = await getCurrentUser();
        setUser(current);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load session";
        setAuthError(message);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    }

    loadUser();
  }, []);

  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  useEffect(() => {
    loadData();
  }, [user]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!amount) return;

    setExpensesError("");
    try {
      await addExpense({
        amount: Number(amount),
        category,
        notes
      });

      setAmount("");
      setNotes("");
      loadData();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add expense";
      setExpensesError(message);
    }
  }

  function openDeleteModal(expense: Expense) {
    setDeleteTarget(expense);
  }

  function closeDeleteModal() {
    setDeleteTarget(null);
  }

  function openViewModal(expense: Expense) {
    setViewTarget(expense);
  }

  function closeViewModal() {
    setViewTarget(null);
  }

  function openEditModal(expense: Expense) {
    setEditTarget(expense);
    setEditAmount(String(expense.amount));
    setEditCategory(expense.category);
    setEditNotes(expense.notes || "");
  }

  function closeEditModal() {
    setEditTarget(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setExpensesError("");
    try {
      await deleteExpense(deleteTarget.id);
      closeDeleteModal();
      loadData();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete expense";
      setExpensesError(message);
    }
  }

  async function confirmEdit() {
    if (!editTarget || !editAmount) return;
    setExpensesError("");
    try {
      await updateExpense(editTarget.id, {
        amount: Number(editAmount),
        category: editCategory,
        notes: editNotes
      });
      closeEditModal();
      closeViewModal();
      loadData();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update expense";
      setExpensesError(message);
    }
  }

  async function handleLogout() {
    setExpensesError("");
    try {
      await logout();
      setUser(null);
      setExpenses([]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to log out";
      setExpensesError(message);
    }
  }

  async function handleAuthSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAuthError("");
    setAuthBusy(true);
    try {
      const payload: { email: string; password: string; name?: string } = {
        email: authEmail.trim(),
        password: authPassword
      };
      if (authMode === "signup") {
        payload.name = authName.trim();
        const created = await signUp(payload);
        setUser(created);
      } else {
        const signedIn = await signIn(payload);
        setUser(signedIn);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  }

  const filteredExpenses = useMemo(() => {
    const now = new Date();
    const rangeStart = new Date(now);
    rangeStart.setHours(0, 0, 0, 0);
    if (rangePreset === "Last 7 days") {
      rangeStart.setDate(now.getDate() - 6);
    } else if (rangePreset === "Last 30 days") {
      rangeStart.setDate(now.getDate() - 29);
    } else {
      rangeStart.setFullYear(now.getFullYear() - 1);
    }

    return expenses.filter((e) => {
      const d = new Date(e.created_at);

      if (filterCategory !== "All" && e.category !== filterCategory) return false;
      if (d < rangeStart) return false;

      return true;
    });
  }, [expenses, filterCategory, rangePreset]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterCategory, rangePreset, expenses.length]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredExpenses.length / pageSize)
  );
  const pagedExpenses = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredExpenses.slice(startIndex, startIndex + pageSize);
  }, [filteredExpenses, currentPage]);

  const thisMonthTotal = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    return expenses.reduce((sum, e) => {
      const d = new Date(e.created_at);
      if (d.getMonth() === month && d.getFullYear() === year) {
        return sum + Number(e.amount || 0);
      }
      return sum;
    }, 0);
  }, [expenses]);

  const thisMonthByCategory = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const summary = new Map<string, number>();

    expenses.forEach((e) => {
      const d = new Date(e.created_at);
      if (d.getMonth() === month && d.getFullYear() === year) {
        summary.set(e.category, (summary.get(e.category) || 0) + Number(e.amount));
      }
    });

    return Array.from(summary.entries()).map(([category, total]) => ({
      category,
      total
    }));
  }, [expenses]);

  function exportCsv() {
    const header = ["Date", "Category", "Amount", "Notes"];
    const rows = filteredExpenses.map((e) => [
      new Date(e.created_at).toLocaleDateString("id-ID"),
      e.category,
      String(e.amount),
      e.notes || "-"
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "expenses.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const popup = window.open("", "_blank");
    if (!popup) return;

    const rows = filteredExpenses
      .map(
        (e) => `
        <tr>
          <td>${new Date(e.created_at).toLocaleDateString("id-ID")}</td>
          <td>${e.category}</td>
          <td style="text-align:right;">${formatIDR(e.amount)}</td>
          <td>${e.notes || "-"}</td>
        </tr>`
      )
      .join("");

    popup.document.write(`
      <html>
        <head>
          <title>Expenses</title>
          <style>
            body { font-family: "Space Mono", monospace; padding: 24px; color: #111; }
            h1 { font-size: 18px; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 6px; }
            th { background: #f3f4f6; text-align: left; }
          </style>
        </head>
        <body>
          <h1>Expenses</h1>
          <div>Total this month: ${formatIDR(thisMonthTotal)}</div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th style="text-align:right;">Amount</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  async function handleInsights() {
    if (insightLoading) return;
    const trimmedPrompt = insightPrompt.trim();
    if (!trimmedPrompt) return;
    setInsightError("");
    setInsightLoading(true);
    setInsightPrompt("");
    try {
      const nextMessages: ChatMessage[] = [
        ...insightMessages,
        { role: "user", content: trimmedPrompt }
      ];
      setInsightMessages(nextMessages);
      setLastSentIndex(nextMessages.length - 1);
      const isDefault =
        insightMessages.length === 0 &&
        trimmedPrompt.toLowerCase() === defaultInsightPrompt;
      const result = await getInsights({
        month: insightMonth,
        year: insightYear,
        prompt: trimmedPrompt,
        messages: nextMessages,
        isDefault
      });
      setInsightMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.text }
      ]);
      setInsightRemaining(result.remaining);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get insights";
      setInsightError(message);
    } finally {
      setInsightLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900 flex items-center justify-center">
        <div className="text-sm text-neutral-500">Checking session...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900 flex items-center">
        <div className="max-w-3xl mx-auto px-6 w-full">
          <AuthCard
            authMode={authMode}
            authName={authName}
            authEmail={authEmail}
            authPassword={authPassword}
            authError={authError}
            authBusy={authBusy}
            onModeChange={(mode) => {
              setAuthMode(mode);
              setAuthError("");
            }}
            onNameChange={setAuthName}
            onEmailChange={setAuthEmail}
            onPasswordChange={setAuthPassword}
            onSubmit={handleAuthSubmit}
            googleUrl={getGoogleAuthUrl()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <span role="img" aria-label="Money with wings">
                {APP_LOGO}
              </span>
              {APP_NAME}
            </h1>
            <p className="text-sm text-neutral-600">
              Signed in as {user.name}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setView("expenses")}
              className={`h-10 rounded-md border px-4 text-sm ${
                view === "expenses"
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300"
              }`}
            >
              Expenses
            </button>
            <button
              type="button"
              onClick={() => setView("insights")}
              className={`h-10 rounded-md border px-4 text-sm ${
                view === "insights"
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300"
              }`}
            >
              Get Insights with AI
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="h-10 rounded-md border border-neutral-300 px-4 text-sm"
            >
              Log out
            </button>
          </div>
        </div>

        {view === "insights" ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-6 flex flex-col gap-4">
            <div className="text-sm text-neutral-500">
              Ask for spending insights and tips.
              {insightRemaining !== null && (
                <span className="ml-2 text-neutral-400">
                  Remaining today: {insightRemaining}
                </span>
              )}
            </div>

            <div
              className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm space-y-3 max-h-[420px] overflow-y-auto"
              aria-live="polite"
            >
              {insightMessages.length === 0 && (
                <div>Your AI insights will appear here.</div>
              )}
              {insightMessages.map((msg, index) => (
                <div
                  key={`${msg.role}-${index}`}
                  className={`max-w-[80%] rounded-md px-3 py-2 ${
                    msg.role === "user"
                      ? "ml-auto bg-white border border-neutral-200"
                      : "bg-neutral-900 text-white"
                  } ${
                    msg.role === "user" && index === lastSentIndex
                      ? "chat-fade-in"
                      : ""
                  }`}
                >
                  <div className="text-xs uppercase tracking-wide opacity-70 mb-1">
                    {msg.role}
                  </div>
                  <div className="whitespace-pre-line">{msg.content}</div>
                </div>
              ))}
              {insightLoading && (
                <div className="max-w-[60%] rounded-md px-3 py-2 bg-neutral-900 text-white chat-fade-in">
                  <div className="text-xs uppercase tracking-wide opacity-70 mb-1">
                    assistant
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="typing-dot">•</span>
                    <span className="typing-dot typing-delay-1">•</span>
                    <span className="typing-dot typing-delay-2">•</span>
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleInsights();
              }}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={insightPrompt}
                  onChange={(e) => setInsightPrompt(e.target.value)}
                  className="h-10 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm disabled:opacity-60"
                  placeholder="Type a message..."
                  disabled={insightLoading}
                />
                <button
                  type="submit"
                  className="h-10 rounded-md bg-neutral-900 px-4 text-sm text-white inline-flex items-center gap-2 transition"
                  disabled={insightLoading || !insightPrompt.trim()}
                  aria-busy={insightLoading}
                >
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 2L11 13" />
                    <path d="M22 2l-7 20-4-9-9-4z" />
                  </svg>
                  {insightLoading ? "Sending..." : "Send"}
                </button>
              </div>
              {insightError && (
                <span className="text-sm text-red-600">{insightError}</span>
              )}
            </form>
          </div>
        ) : (
          <>
        {/* Add Expense */}
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-10 items-center"
        >
          <input
            type="number"
            placeholder="Amount (IDR)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="md:col-span-2 h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm"
            required
          />

          <CategorySelect
            label="Expense category"
            value={category}
            options={categories.filter((c) => c !== "All")}
            onChange={setCategory}
            className="md:col-span-1"
          />

          <input
            type="text"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="md:col-span-2 h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          />

          <button className="md:col-span-1 h-10 rounded-md bg-neutral-900 text-sm font-medium text-white">
            Add Expense
          </button>
        </form>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6 md:items-center">
          <CategorySelect
            label="Filter by category"
            value={filterCategory}
            options={categories}
            onChange={setFilterCategory}
            className="w-full md:w-48"
          />

          <CategorySelect
            label="Filter by date range"
            value={rangePreset}
            options={rangePresetOptions}
            onChange={(value) =>
              setRangePreset(value as "Last 7 days" | "Last 30 days" | "Last year")
            }
            className="w-full md:w-48"
          />
        </div>

        {expensesError && (
          <div className="mb-4 text-sm text-red-600">{expensesError}</div>
        )}

        <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm text-neutral-500">This month total</div>
              <div className="text-lg font-semibold">
                {formatIDR(thisMonthTotal)}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setExportOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-300 px-3 text-sm"
              >
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="M7 10l5 5 5-5" />
                  <path d="M12 15V3" />
                </svg>
                Export
              </button>
            </div>
          </div>
          {thisMonthByCategory.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <div className="flex gap-3 min-w-max">
                {thisMonthByCategory.map((item) => (
                  <div
                    key={item.category}
                    className="min-w-[160px] rounded border border-neutral-200 bg-neutral-50 p-3 text-sm"
                  >
                    <div className="text-neutral-500">{item.category}</div>
                    <div className="font-semibold">
                      {formatIDR(item.total)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <ExpenseTable
          expenses={pagedExpenses}
          filteredCount={filteredExpenses.length}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPrev={() => setCurrentPage((page) => Math.max(1, page - 1))}
          onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          onRowClick={openViewModal}
          onDeleteClick={openDeleteModal}
          formatAmount={formatIDR}
        />
          </>
        )}

      </div>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">Delete expense?</h2>
            <p className="text-sm text-neutral-600 mb-4">
              This will remove{" "}
              <span className="font-medium text-neutral-900">
                {formatIDR(deleteTarget.amount)}
              </span>{" "}
              from{" "}
              <span className="font-medium text-neutral-900">
                {deleteTarget.category}
              </span>
              .
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded bg-red-600 px-3 py-2 text-sm text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {viewTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">Expense details</h2>
              <button
                type="button"
                onClick={closeViewModal}
                className="text-sm text-neutral-500"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">Date</span>
                <span className="text-neutral-900">
                  {new Date(viewTarget.created_at).toLocaleString("id-ID")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Category</span>
                <span className="text-neutral-900">{viewTarget.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Amount</span>
                <span className="text-neutral-900">
                  {formatIDR(viewTarget.amount)}
                </span>
              </div>
              <div className="pt-2">
                <div className="text-neutral-500 mb-1">Notes</div>
                <div className="rounded border border-neutral-200 bg-neutral-50 p-2 text-neutral-900 min-h-[48px]">
                  {viewTarget.notes || "-"}
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => openEditModal(viewTarget)}
                className="rounded border border-neutral-300 px-3 py-2 text-sm mr-2"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={closeViewModal}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-4">Edit expense</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                confirmEdit();
              }}
              className="grid gap-3"
            >
              <input
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm"
                required
              />
              <CategorySelect
                label="Edit category"
                value={editCategory}
                options={categories.filter((c) => c !== "All")}
                onChange={setEditCategory}
              />
              <input
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded border border-neutral-300 px-3 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-neutral-900 px-3 py-2 text-sm text-white"
                >
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {exportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">Export expenses</h2>
            <p className="text-sm text-neutral-600 mb-4">
              Choose a format to download your filtered expenses.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                className="rounded bg-neutral-900 px-3 py-2 text-sm text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportOpen(false);
                  exportCsv();
                }}
                className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportOpen(false);
                  exportPdf();
                }}
                className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
