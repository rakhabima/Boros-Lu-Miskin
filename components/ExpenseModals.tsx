"use client";

import { useActionState, useState } from "react";
import { ExpenseTable } from "./ExpenseTable";
import { CategorySelect } from "./CategorySelect";
import {
  deleteExpenseAction,
  updateExpenseAction,
  type ExpenseFormState
} from "@/actions/expenses";
import { CATEGORIES, formatIDR } from "@/lib/format";
import type { Expense } from "@/types";

function DeleteConfirmModal({
  expense,
  onCancel,
  onDeleted
}: {
  expense: Expense;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    ExpenseFormState,
    FormData
  >(async (prev, fd) => {
    const result = await deleteExpenseAction(prev, fd);
    if (!result.error) onDeleted();
    return result;
  }, {});

  return (
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
            {formatIDR(expense.amount)}
          </span>{" "}
          from{" "}
          <span className="font-medium text-neutral-900">
            {expense.category}
          </span>
          .
        </p>
        {state.error && (
          <div className="mb-4 text-sm text-red-600">{state.error}</div>
        )}
        <form action={formAction} className="flex justify-end gap-2">
          <input type="hidden" name="id" value={expense.id} />
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-60"
          >
            {pending ? "Deleting..." : "Delete"}
          </button>
        </form>
      </div>
    </div>
  );
}

function EditExpenseModal({
  expense,
  onCancel,
  onSaved
}: {
  expense: Expense;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState(expense.category);
  const [state, formAction, pending] = useActionState<
    ExpenseFormState,
    FormData
  >(async (prev, fd) => {
    const result = await updateExpenseAction(prev, fd);
    if (!result.error) onSaved();
    return result;
  }, {});

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-4">Edit expense</h2>
        <form action={formAction} className="grid gap-3">
          <input type="hidden" name="id" value={expense.id} />
          <input
            type="number"
            name="amount"
            defaultValue={expense.amount}
            className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm"
            required
          />
          <CategorySelect
            label="Edit category"
            name="category"
            value={category}
            options={CATEGORIES.filter((c) => c !== "All")}
            onChange={setCategory}
          />
          <input
            type="text"
            name="notes"
            defaultValue={expense.notes || ""}
            placeholder="Notes (optional)"
            className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          />
          {state.error && (
            <div className="text-sm text-red-600">{state.error}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-60"
            >
              {pending ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ExpenseModals({
  expenses,
  filteredCount,
  currentPage,
  totalPages,
  onPrev,
  onNext
}: {
  expenses: Expense[];
  filteredCount: number;
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [viewTarget, setViewTarget] = useState<Expense | null>(null);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);

  return (
    <>
      <ExpenseTable
        expenses={expenses}
        filteredCount={filteredCount}
        currentPage={currentPage}
        totalPages={totalPages}
        onPrev={onPrev}
        onNext={onNext}
        onRowClick={setViewTarget}
        onDeleteClick={setDeleteTarget}
      />

      {deleteTarget && (
        <DeleteConfirmModal
          expense={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onDeleted={() => setDeleteTarget(null)}
        />
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
                onClick={() => setViewTarget(null)}
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
                onClick={() => setEditTarget(viewTarget)}
                className="rounded border border-neutral-300 px-3 py-2 text-sm mr-2"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setViewTarget(null)}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <EditExpenseModal
          expense={editTarget}
          onCancel={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            setViewTarget(null);
          }}
        />
      )}
    </>
  );
}
