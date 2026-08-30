"use client";

import { useEffect, useMemo, useState } from "react";
import { ExpenseFilters } from "./ExpenseFilters";
import { ExpenseModals } from "./ExpenseModals";
import { ExportModal } from "./ExportModal";
import { filterExpenses, formatIDR, PAGE_SIZE } from "@/lib/format";
import type { Expense } from "@/types";

type Summary = {
  total: number;
  byCategory: Array<{ category: string; total: number }>;
};

/**
 * Owns filter/range/page state for the expenses list.
 *
 * These used to live in the URL and go through router.push(), which meant every
 * filter change and page click cost an RSC round-trip AND a re-query of every
 * expense — to run the exact same in-memory filter the client can do instantly
 * on data it already has. The server was never filtering in SQL, so the trip
 * bought nothing and only added latency.
 *
 * The URL is still kept in sync, but via history.replaceState so it does not
 * trigger a navigation. Links stay shareable; interaction stays instant.
 *
 * ponytail: filters the full list in memory, like the original did. Fine to a
 * few thousand rows. Past that, push the filter into SQL and paginate there —
 * at which point the round-trip earns its keep.
 */
export function ExpensesView({
  expenses,
  summary,
  initialCategory,
  initialRange,
  initialPage
}: {
  expenses: Expense[];
  summary: Summary;
  initialCategory: string;
  initialRange: string;
  initialPage: number;
}) {
  // Seeded from the server's reading of searchParams, so a shared link renders
  // already filtered and there is no post-hydration correction.
  const [category, setCategory] = useState(initialCategory);
  const [range, setRange] = useState(initialRange);
  const [page, setPage] = useState(initialPage);

  // Mirror state into the URL without navigating — replaceState does not
  // notify the Next router, so no RSC request is made.
  useEffect(() => {
    const p = new URLSearchParams();
    if (category !== "All") p.set("category", category);
    if (range !== "Last 7 days") p.set("range", range);
    if (page !== 1) p.set("page", String(page));
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
  }, [category, range, page]);

  const filtered = useMemo(
    () => filterExpenses(expenses, category, range),
    [expenses, category, range]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  function changeCategory(value: string) {
    setCategory(value);
    setPage(1);
  }

  function changeRange(value: string) {
    setRange(value);
    setPage(1);
  }

  return (
    <>
      <ExpenseFilters
        category={category}
        range={range}
        onCategoryChange={changeCategory}
        onRangeChange={changeRange}
      />

      <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm text-neutral-500">This month total</div>
            <div className="text-lg font-semibold">
              {formatIDR(summary.total)}
            </div>
          </div>
          <ExportModal expenses={filtered} monthTotal={summary.total} />
        </div>
        {summary.byCategory.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <div className="flex gap-3 min-w-max">
              {summary.byCategory.map((item) => (
                <div
                  key={item.category}
                  className="min-w-[160px] rounded border border-neutral-200 bg-neutral-50 p-3 text-sm"
                >
                  <div className="text-neutral-500">{item.category}</div>
                  <div className="font-semibold">{formatIDR(item.total)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ExpenseModals
        expenses={paged}
        filteredCount={filtered.length}
        currentPage={currentPage}
        totalPages={totalPages}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      />
    </>
  );
}
