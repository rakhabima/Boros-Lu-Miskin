"use client";

import { CategorySelect } from "./CategorySelect";
import { RANGE_PRESETS } from "@/lib/format";

/**
 * Presentational only. Filter state lives in ExpensesView so a change is an
 * instant in-memory re-filter rather than a router.push + RSC round-trip.
 */
export function ExpenseFilters({
  category,
  categories,
  range,
  onCategoryChange,
  onRangeChange
}: {
  category: string;
  categories: string[];
  range: string;
  onCategoryChange: (value: string) => void;
  onRangeChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col md:flex-row gap-4 mb-6 md:items-center">
      <CategorySelect
        label="Filter by category"
        value={category}
        options={categories}
        onChange={onCategoryChange}
        className="w-full md:w-48"
      />
      <CategorySelect
        label="Filter by date range"
        value={range}
        options={RANGE_PRESETS}
        onChange={onRangeChange}
        className="w-full md:w-48"
      />
    </div>
  );
}
