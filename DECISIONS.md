# DECISIONS.md

Engineering decisions made across all three parts of the take-home, including rationale and what would change without a time constraint.

---

## Part 1 — Price Filter Bug Fix

### What changed and why

**Root cause:** `api.ts` contained a sentinel: `priceMax === 100 ? Number.MAX_SAFE_INTEGER : priceMax`. This silently treated `$100` as "no upper bound," so filtering at `$100/hr` returned the entire fleet. The slider also topped out at `$100`, making `$125` unrepresentable.

**Changes made:**

- **Removed the sentinel** in `api.ts` — `priceMax` is now always passed through as a real ceiling. The conversion to cents happens downstream in `data_helpers.ts`.
- **Raised slider max to `$250`** — the seed fleet's highest rate is ~`$220/hr`; `$250` sits above it so users can express "show everything" while still being able to set real caps anywhere in the range.
- **Changed slider step from `$10` to `$5`** — `$125` is not reachable at `$10` steps; `$5` makes it selectable without making the slider unusably granular.
- **Added `PRICE_FILTER_SLIDER_MAX_DOLLARS` constant in `form.tsx`** — the slider max, its label ("250+"), the reset value, and the disabled-state default all reference the same number. Without a shared constant these drift and produce subtle bugs.
- **Updated default range to `[10, 250]`** — keeps first-load behavior open (full catalog visible) while ensuring any lowered max actually filters.

### What I'd do differently without a time constraint

- **Derive slider max from data.** The `$250` constant is tied to seed rates and will silently become wrong if the catalog changes. A better approach queries the max `hourly_rate_cents` from `getVehicles()` at page load and uses that as the slider ceiling, so the UI always spans the real range.
- **Distinguish "no results" from "bad input" in `searchVehicles`.** The current try/catch swallows both validation errors and genuine empty results, returning `[]` in both cases. The user sees an empty grid with no explanation. The fix would surface a typed error state so the UI can show "no matches" vs "fix your date range."
- **Add an explicit "no maximum" toggle.** A slider with a ceiling is always a leaky abstraction — users looking for a "$1000/hr yacht" shouldn't have to understand that "250+" means unbounded. A checkbox or separate control makes the intent explicit.

---

## Part 2 — Discount Rules

### What changed and why

**New files and changes:**

- **`app/server/holidays.ts`** — Fictitious holiday dates as a typed `{ month, day }[]` constant, separate from logic. Isolating config from rules means holiday dates can be updated without touching the pricing engine.
- **`app/server/pricing.ts`** — Single home for both discount rules and winner selection:
  - *Holiday (17% off):* The rental window must overlap a holiday's UTC calendar day, and neither the pickup nor the drop-off instant falls on that same date. "Strictly inside" prevents gaming the discount by picking up or dropping off exactly on the holiday.
  - *Long trip ($10/hr off):* Duration strictly greater than 72 hours (`> 3 × 24h`). The `$10/hr` reduction is applied to the listed rate before multiplying by hours; floored at `$0/hr` so cheap vehicles don't produce negative totals.
  - *Conflict resolution:* If both qualify, `quoteReservationPricing` computes both totals and returns whichever is cheaper for the customer.
  - Returns a `ReservationQuote` shape with `baseHourlyRateCents`, `effectiveHourlyRateCents`, `baseTotalPriceCents`, `totalPriceCents`, and a `discount` discriminator — enough for the UI to render strikethroughs and discount labels without re-implementing any math.
- **`api.ts` — `getQuote`** replaced the old inline `calculateTotalPrice` and delegates entirely to `quoteReservationPricing`. No pricing math lives in the API layer.
- **`VehicleListItem.tsx` and `ReviewPage.tsx`** — both call `API.getQuote` and display the `ReservationQuote` fields. No discount percentages or dollar amounts are hardcoded in components.

**Key interpretation calls:**

| Ambiguity | Choice made | Reason |
|-----------|-------------|--------|
| "More than 3 days" | `> 72 hours` (not calendar days) | Consistent with existing hourly rental math; simpler edge cases |
| Holiday timezone | UTC calendar day from Luxon `toUTC()` | ISO strings arrive in UTC; avoids local-TZ mismatch at midnight boundaries |
| Equal totals (both discounts tie) | Keep the first winner (holiday) | Deterministic; ties are extremely rare in practice |

### What I'd do differently without a time constraint

- **Make the timezone configurable.** Anchoring holiday logic to UTC means a renter in UTC-5 who books midnight-to-midnight can get a different result than they'd expect. A business timezone (e.g. `America/New_York` or a value from config) would make behavior predictable for users in a specific market.
- **Reconsider "more than 3 days" as calendar days.** Hourly math is precise, but a customer thinking "I want a 4-day rental" thinks in calendar days, not hours. A 3-day 1-hour trip qualifying as a long trip would feel wrong to them.
- **Batch quoting in `searchVehicles`.** Each row in the vehicle list calls `getQuote` independently. With a small seed catalog this is fine, but at scale you'd want `searchVehicles` to return quoted prices in one pass rather than N synchronous evaluations on the client.
- **Persist `total_price_cents` on reservations.** `Reservation` seeds have a `total_price_cents` field that is never recomputed after the discount rules were added. Any UI that reads historical reservation totals will show pre-discount numbers. Proper fix: recompute on write or treat the stored value as a snapshot and display a "quoted at booking" label.

---

## Part 3 — Refactor and Tests

### What changed and why

**Refactor of `pricing.ts`:**

- **Extracted `buildBaseQuote`, `buildHolidayQuote`, `buildLongTripQuote`** as pure functions. Before the refactor, both discount paths inlined a full `ReservationQuote` object literal directly inside `if` blocks in `quoteReservationPricing`. Extracting them makes each path independently readable, testable in isolation, and removes the structural duplication.
- **Added `pickCheaper(a, b)`** — the pattern `if (candidate.totalPriceCents < best.totalPriceCents) best = candidate` appeared twice. The helper makes the selection logic read as data flow (`best = pickCheaper(best, candidate)`) rather than mutation.
- **Fixed `effectiveHourlyRateCents` for the holiday path.** The original computed it as `Math.round(holidayTotalCents / durationHours)` — back-deriving a rate from the total. This loses a cent for non-integer durations and breaks the symmetry with the long-trip path. The fix computes it directly: `Math.round(hourlyRateCents * HOLIDAY_DISCOUNT_FACTOR)`, so rate and total both derive from the same factor and always agree.

**Test setup — why vitest:**

No test runner existed. The project is `"type": "module"` (ESM) with TypeScript. `jest` requires non-trivial config to handle both; `node:test` (built-in) works with `tsx` already in devDependencies but has a verbose assertion API. `vitest` is ESM-native, requires zero config for this stack, and produces the familiar `describe/it/expect` output that reads clearly in a review context.

**Tests added (`pricing.test.ts`, 14 cases):**

| Suite | Cases |
|-------|-------|
| `qualifiesHolidayDiscount` | spans holiday ✓, pickup on holiday ✗, drop-off on holiday ✗, no overlap ✗, year-boundary holiday ✓ |
| `qualifiesLongTrip` | exactly 72h ✗, 72h+1min ✓, 4-day trip ✓, 1-day trip ✗ |
| `quoteReservationPricing` | no discount, holiday-only, long-trip-only, both qualify (cheaper wins), rate below $10/hr (floor at 0) |

### What I'd do differently without a time constraint

- **Test the UI components.** `VehicleListItem` and `ReviewPage` call `API.getQuote` and render the result, but there are no component tests. With more time: render both components with a mocked `ReservationQuote` and assert the strikethrough and discount label appear correctly for each `discount` discriminator value.
- **Add property-based tests for `qualifiesHolidayDiscount`.** The overlap logic involves UTC calendar boundaries, year rollovers, and exclusion conditions that interact in non-obvious ways. A property-based approach (e.g. fast-check) could generate arbitrary `[start, end]` pairs and verify invariants — for example: "if `start` and `end` are on the same UTC day, the result is always false."
- **Write `DECISIONS.md` from the start.** The decisions documented here were reconstructed from `AI_LOG.md`. In a real project these would be written as decisions are made, while the tradeoffs are still fresh and before they require archaeology to recover.

---

## Bonus — UX Callout

The vehicle list renders one full-width card per row inside a 9-column grid, leaving significant horizontal space unused on larger screens — a 2-up card layout would show more inventory without requiring additional scrolling, reducing time-to-book. The "Confirm reservation" button on the review page is also a silent no-op with no feedback to the user; even a disabled state with a "coming soon" tooltip would prevent confusion and set honest expectations.
