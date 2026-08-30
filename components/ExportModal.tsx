"use client";

import { useState } from "react";
import { formatIDR } from "@/lib/format";
import type { Expense } from "@/types";

/** Escape for HTML text content. The PDF export builds markup by interpolation. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Quote a CSV cell. Doubling quotes is not enough: a cell starting with
 * = + - @ (or a leading tab/CR) is treated as a FORMULA by Excel, Sheets and
 * LibreOffice. Prefixing a single quote makes the spreadsheet read it as text.
 */
function csvCell(value: unknown): string {
  const raw = String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function ExportModal({
  expenses,
  monthTotal
}: {
  expenses: Expense[];
  monthTotal: number;
}) {
  const [open, setOpen] = useState(false);

  function exportCsv() {
    const header = ["Date", "Category", "Amount", "Notes"];
    const rows = expenses.map((e) => [
      new Date(e.created_at).toLocaleDateString("id-ID"),
      e.category,
      String(e.amount),
      e.notes || "-"
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map(csvCell)
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

    const rows = expenses
      .map(
        (e) => `
        <tr>
          <td>${escapeHtml(new Date(e.created_at).toLocaleDateString("id-ID"))}</td>
          <td>${escapeHtml(e.category)}</td>
          <td style="text-align:right;">${escapeHtml(formatIDR(e.amount))}</td>
          <td>${escapeHtml(e.notes || "-")}</td>
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
          <div>Total this month: ${formatIDR(monthTotal)}</div>
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

  return (
    <>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
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

      {open && (
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
                onClick={() => setOpen(false)}
                className="rounded bg-neutral-900 px-3 py-2 text-sm text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  exportCsv();
                }}
                className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
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
    </>
  );
}
