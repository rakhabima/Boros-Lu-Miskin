"use client";

import { formatIDR, PAGE_SIZE } from "@/lib/format";
import type { Expense } from "@/types";

type ExpenseTableProps = {
  expenses: Expense[];
  filteredCount: number;
  currentPage: number;
  totalPages: number;
  onRowClick: (expense: Expense) => void;
  onDeleteClick: (expense: Expense) => void;
  onPrev: () => void;
  onNext: () => void;
};

export function ExpenseTable({
  expenses,
  filteredCount,
  currentPage,
  totalPages,
  onRowClick,
  onDeleteClick,
  onPrev,
  onNext
}: ExpenseTableProps) {

  return (
    <>
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
            {expenses.map((e) => (
              <tr
                key={e.id}
                className="border-t border-neutral-200 cursor-pointer hover:bg-neutral-50"
                onClick={() => onRowClick(e)}
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
                      onDeleteClick(e);
                    }}
                    className="rounded border border-neutral-300 px-2 py-1 text-sm"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {filteredCount === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-6 text-neutral-500">
                  No expenses found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filteredCount > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-neutral-600">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={currentPage === 1}
              className={`h-9 inline-flex items-center rounded-md border border-neutral-300 px-3 ${
                currentPage === 1
                  ? "pointer-events-none cursor-not-allowed opacity-50"
                  : ""
              }`}
            >
              Prev
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={currentPage === totalPages}
              className={`h-9 inline-flex items-center rounded-md border border-neutral-300 px-3 ${
                currentPage === totalPages
                  ? "pointer-events-none cursor-not-allowed opacity-50"
                  : ""
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}
