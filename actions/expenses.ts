"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { parseExpenseBody } from "@/lib/validation";
import {
  createExpense,
  updateExpense,
  deleteExpense
} from "@/lib/expenses";

export type ExpenseFormState = { error?: string; field?: string };

export async function addExpenseAction(
  _prev: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  const user = await requireUser();
  const parsed = parseExpenseBody({
    amount: formData.get("amount"),
    category: formData.get("category"),
    notes: formData.get("notes")
  });
  if (!parsed.ok) return { error: parsed.message, field: parsed.field };

  await createExpense(user.id, parsed);
  revalidatePath("/");
  return {};
}

export async function updateExpenseAction(
  _prev: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  const user = await requireUser();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: "Invalid expense id", field: "id" };

  const parsed = parseExpenseBody({
    amount: formData.get("amount"),
    category: formData.get("category"),
    notes: formData.get("notes")
  });
  if (!parsed.ok) return { error: parsed.message, field: parsed.field };

  const updated = await updateExpense(user.id, id, parsed);
  if (!updated) return { error: "Expense not found", field: "id" };

  revalidatePath("/");
  return {};
}

export async function deleteExpenseAction(
  _prev: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  const user = await requireUser();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: "Invalid expense id", field: "id" };

  const removed = await deleteExpense(user.id, id);
  if (!removed) return { error: "Expense not found", field: "id" };

  revalidatePath("/");
  return {};
}
