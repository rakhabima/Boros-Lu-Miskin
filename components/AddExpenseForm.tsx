"use client";

import { useActionState, useRef, useState } from "react";
import { addExpenseAction, type ExpenseFormState } from "@/actions/expenses";
import { CategorySelect } from "./CategorySelect";
import { CATEGORIES } from "@/lib/format";

export function AddExpenseForm() {
  const [category, setCategory] = useState("Food");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<
    ExpenseFormState,
    FormData
  >(async (prev, fd) => {
    const result = await addExpenseAction(prev, fd);
    if (!result.error) formRef.current?.reset();
    return result;
  }, {});

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-10 items-center"
      >
        <input
          type="number"
          name="amount"
          placeholder="Amount (IDR)"
          className="md:col-span-2 h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          required
        />
        <CategorySelect
          label="Expense category"
          name="category"
          value={category}
          options={CATEGORIES.filter((c) => c !== "All")}
          onChange={setCategory}
          className="md:col-span-1"
        />
        <input
          type="text"
          name="notes"
          placeholder="Notes (optional)"
          className="md:col-span-2 h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm"
        />
        <button
          disabled={pending}
          className="md:col-span-1 h-10 rounded-md bg-neutral-900 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Adding..." : "Add Expense"}
        </button>
      </form>
      {state.error && (
        <div className="mb-4 text-sm text-red-600">{state.error}</div>
      )}
    </>
  );
}
