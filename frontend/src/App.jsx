import { useEffect, useMemo, useState } from "react";
import {
  addExpense,
  deleteExpense,
  getCurrentUser,
  getExpenses,
  getGoogleAuthUrl,
  logout,
  signIn,
  signUp
} from "./api";

const categories = ["All", "Food", "Transport", "Shopping", "Subscription", "Other"];

function formatIDR(value) {
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
  const [expenses, setExpenses] = useState([]);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  // Filters
  const [filterCategory, setFilterCategory] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  async function loadData() {
    if (!user) return;
    setExpenses(await getExpenses());
  }

  useEffect(() => {
    async function loadUser() {
      const current = await getCurrentUser();
      setUser(current);
      setAuthLoading(false);
    }

    loadUser();
  }, []);

  useEffect(() => {
    loadData();
  }, [user]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount) return;

    await addExpense({
      amount: Number(amount),
      category,
      notes
    });

    setAmount("");
    setNotes("");
    loadData();
  }

  function openDeleteModal(expense) {
    setDeleteTarget(expense);
  }

  function closeDeleteModal() {
    setDeleteTarget(null);
  }

  function openViewModal(expense) {
    setViewTarget(expense);
  }

  function closeViewModal() {
    setViewTarget(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await deleteExpense(deleteTarget.id);
    closeDeleteModal();
    loadData();
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    setExpenses([]);
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    setAuthBusy(true);
    try {
      const payload = {
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
      setAuthError(err.message);
    } finally {
      setAuthBusy(false);
    }
  }

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const d = new Date(e.created_at);

      if (filterCategory !== "All" && e.category !== filterCategory) return false;
      if (startDate && d < new Date(startDate + "T00:00:00")) return false;
      if (endDate && d > new Date(endDate + "T23:59:59")) return false;

      return true;
    });
  }, [expenses, filterCategory, startDate, endDate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterCategory, startDate, endDate, expenses.length]);

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
          <div className="rounded-xl border border-neutral-200 bg-white p-6">
            <h1 className="text-2xl font-semibold mb-2">
              BOROS LU MISKIN!!!
            </h1>
            <p className="text-sm text-neutral-600 mb-4">
              Catet pengeluaran Lo biar ga boros jon!
            </p>
            <div className="flex flex-col gap-4">
              <div className="flex gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError("");
                  }}
                  className={`rounded-md border px-3 py-2 ${
                    authMode === "login"
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300"
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signup");
                    setAuthError("");
                  }}
                  className={`rounded-md border px-3 py-2 ${
                    authMode === "signup"
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300"
                  }`}
                >
                  Sign up
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="grid gap-2">
                {authMode === "signup" && (
                  <input
                    type="text"
                    placeholder="Name"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                    required
                  />
                )}
                <input
                  type="email"
                  placeholder="Email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                  required
                />
                <input
                  type="password"
                  placeholder="Password (min 8 characters)"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                  required
                  minLength={8}
                />
                {authError && (
                  <div className="text-sm text-red-600">{authError}</div>
                )}
                <button
                  type="submit"
                  disabled={authBusy}
                  className="h-10 rounded-md border border-neutral-900 bg-neutral-900 text-sm font-medium text-white transition hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900/30 disabled:opacity-60"
                >
                  {authMode === "signup" ? "Create account" : "Sign in"}
                </button>
              </form>

              <div className="flex items-center gap-3 text-xs text-neutral-400">
                <span className="h-px flex-1 bg-neutral-200" />
                or
                <span className="h-px flex-1 bg-neutral-200" />
              </div>

              <a
                href={getGoogleAuthUrl()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                aria-label="Continue with Google"
              >
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  viewBox="0 0 48 48"
                >
                  <path
                    fill="#FFC107"
                    d="M43.6 20.5H42V20H24v8h11.3C33.9 32.5 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8.1 3.1l5.7-5.7C34.2 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10.5 0 19-8.5 19-19 0-1.3-.1-2.1-.4-3.5z"
                  />
                  <path
                    fill="#FF3D00"
                    d="M6.3 14.7l6.6 4.8C14.7 16.1 19 12 24 12c3.1 0 5.9 1.2 8.1 3.1l5.7-5.7C34.2 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
                  />
                  <path
                    fill="#4CAF50"
                    d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.2 35.4 26.7 36 24 36c-5.4 0-9.9-3.4-11.5-8.1l-6.6 5.1C9.2 39.7 16.1 44 24 44z"
                  />
                  <path
                    fill="#1976D2"
                    d="M43.6 20.5H42V20H24v8h11.3c-1.1 3-3.5 5.4-6.8 6.6l6.3 5.2C38.8 36 43 30.6 43 24c0-1.3-.1-2.1-.4-3.5z"
                  />
                </svg>
                Continue with Google
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold">BOROS LU MISKIN!!!</h1>
            <p className="text-sm text-neutral-600">
              Signed in as {user.name}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="h-10 rounded-md border border-neutral-300 px-4 text-sm"
          >
            Log out
          </button>
        </div>

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

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="md:col-span-1 h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          >
            {categories
              .filter((c) => c !== "All")
              .map((c) => (
                <option key={c}>{c}</option>
              ))}
          </select>

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
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm"
            aria-label="Filter by category"
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-neutral-300 bg-white px-3 py-2"
          />

          <span
            aria-hidden="true"
            className="hidden md:inline-block text-neutral-400"
          >
            -
          </span>

          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded border border-neutral-300 bg-white px-3 py-2"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border border-neutral-300 rounded bg-white">
            <thead className="bg-neutral-100">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Category</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedExpenses.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-neutral-200 cursor-pointer hover:bg-neutral-50"
                  onClick={() => openViewModal(e)}
                >
                  <td className="px-3 py-2">
                    {new Date(e.created_at).toLocaleDateString("id-ID")}
                  </td>
                  <td className="px-3 py-2">{e.category}</td>
                  <td className="px-3 py-2 text-right">
                    {formatIDR(e.amount)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openDeleteModal(e);
                      }}
                      className="rounded border border-neutral-300 px-2 py-1 text-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {filteredExpenses.length === 0 && (
                <tr>
                  <td
                    colSpan="4"
                    className="text-center py-6 text-neutral-500"
                  >
                    No expenses found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredExpenses.length > pageSize && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-neutral-600">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setCurrentPage((page) => Math.max(1, page - 1))
                }
                disabled={currentPage === 1}
                className="h-9 rounded-md border border-neutral-300 px-3 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() =>
                  setCurrentPage((page) => Math.min(totalPages, page + 1))
                }
                disabled={currentPage === totalPages}
                className="h-9 rounded-md border border-neutral-300 px-3 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 text-right text-sm text-neutral-600">
          This month:{" "}
          <span className="font-semibold text-neutral-900">
            {formatIDR(thisMonthTotal)}
          </span>
        </div>
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
                onClick={closeViewModal}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
