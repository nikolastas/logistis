export function currentBudgetMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function isBudgetMonth(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) > 0;
}

export function getBudgetReviewMonth(value: string | null, fallback = currentBudgetMonth()): string {
  return isBudgetMonth(value) ? value : fallback;
}

export function adjacentBudgetMonth(month: string, offset: -1 | 1): string | null {
  if (!isBudgetMonth(month)) throw new RangeError("Invalid budget month");
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + number - 1 + offset;
  const nextYear = Math.floor(index / 12);
  if (nextYear < 1 || nextYear > 9999) return null;
  return `${String(nextYear).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}`;
}

export function budgetMonthSearch(
  previous: URLSearchParams,
  month: string,
  currentMonth: string,
): URLSearchParams {
  if (!isBudgetMonth(month)) throw new RangeError("Invalid budget month");
  const next = new URLSearchParams(previous);
  if (month === currentMonth) next.delete("month");
  else next.set("month", month);
  return next;
}
