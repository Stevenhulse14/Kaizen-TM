/**
 * Fictitious recurring holidays (README Part 2).
 * Month/day only — interpreted with reservation instants in UTC calendar space (see pricing.ts).
 */
export const FICTITIOUS_HOLIDAYS = [
  { month: 1, day: 21 },
  { month: 2, day: 12 },
  { month: 3, day: 4 },
  { month: 5, day: 2 },
  { month: 6, day: 16 },
  { month: 7, day: 26 },
  { month: 8, day: 3 },
  { month: 9, day: 1 },
  { month: 11, day: 5 },
  { month: 12, day: 18 },
] as const;
