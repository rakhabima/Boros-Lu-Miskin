import type { Expense } from "../types";

type ExpenseTableProps = {
  expenses: Expense[];
  filteredCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
  onRowClick: (expense: Expense) => void;
  onDeleteClick: (expense: Expense) => void;
  formatAmount: (value: number) => string;
};

export function ExpenseTable({
  expenses,
  filteredCount,
  currentPage,
  totalPages,
  pageSize,
  onPrev,
  onNext,
  onRowClick,
  onDeleteClick,
  formatAmount
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
                  {formatAmount(e.amount)}
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

      {filteredCount > pageSize && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-neutral-600">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={currentPage === 1}
              className="h-9 rounded-md border border-neutral-300 px-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={currentPage === totalPages}
              className="h-9 rounded-md border border-neutral-300 px-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}
