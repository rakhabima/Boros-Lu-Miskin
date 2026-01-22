import { useEffect, useMemo, useState } from "react";
import { addExpense, deleteExpense, getExpenses } from "./api";

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

  // Filters
  const [filterCategory, setFilterCategory] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  async function loadData() {
    setExpenses(await getExpenses());
  }

  useEffect(() => {
    loadData();
  }, []);

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

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-8">Expense Tracker</h1>

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
