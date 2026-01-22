import { useEffect, useMemo, useState } from "react";
import { addExpense, getExpenses } from "./api";

const categories = ["All", "Food", "Transport", "Shopping", "Other"];

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

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const d = new Date(e.created_at);

      if (filterCategory !== "All" && e.category !== filterCategory) return false;
      if (startDate && d < new Date(startDate + "T00:00:00")) return false;
      if (endDate && d > new Date(endDate + "T23:59:59")) return false;

      return true;
    });
  }, [expenses, filterCategory, startDate, endDate]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-8">Expense Tracker</h1>

        {/* Add Expense */}
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-4 gap-4 mb-10"
        >
          <input
            type="number"
            placeholder="Amount (IDR)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="col-span-1 rounded border border-neutral-300 bg-white px-3 py-2"
            required
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="col-span-1 rounded border border-neutral-300 bg-white px-3 py-2"
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
            className="col-span-1 rounded border border-neutral-300 bg-white px-3 py-2"
          />

          <button className="col-span-1 rounded bg-neutral-900 text-white font-medium">
            Add Expense
          </button>
        </form>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded border border-neutral-300 bg-white px-3 py-2"
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
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-neutral-200"
                >
                  <td className="px-3 py-2">
                    {new Date(e.created_at).toLocaleDateString("id-ID")}
                  </td>
                  <td className="px-3 py-2">{e.category}</td>
                  <td className="px-3 py-2 text-right">
                    {formatIDR(e.amount)}
                  </td>
                </tr>
              ))}

              {filteredExpenses.length === 0 && (
                <tr>
                  <td
                    colSpan="3"
                    className="text-center py-6 text-neutral-500"
                  >
                    No expenses found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
