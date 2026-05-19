# Pricing & discounts (Part 2)

Documentation for **where rules live** and **what not to duplicate**. Implementation matches **`app/server/pricing.ts`** and **`app/server/holidays.ts`**.

## Layout

| File | Role |
|------|------|
| `app/server/data.ts` | Seed vehicles & reservations (facts only). |
| `app/server/holidays.ts` | `FICTITIOUS_HOLIDAYS` — month/day config from README. |
| `app/server/pricing.ts` | Holiday rule + long-trip rule + pick cheaper discount; `quoteReservationPricing()`. |
| `app/server/data_helpers.ts` | Availability filtering (unchanged). |
| `app/server/api.ts` | `getQuote` — validates vehicle + times → delegates to **`pricing`**. |
| `app/components/search/VehicleListItem.tsx` | Displays **`API.getQuote`** only (no local % / $10 math). |
| `app/components/review/ReviewPage.tsx` | Same — summary from **`API.getQuote`**. |

## Rules (summary)

1. **Holiday:** Rental interval overlaps a fictitious holiday’s **UTC calendar day**, and pick-up is **not** on that date, and drop-off is **not** on that date → **17% off total** (customer pays **83%**).
2. **Long trip:** Duration **> 72 hours** (“more than 3 days”) → **$10/hr** off the listed hourly rate (not below $0/hr), then × hours for total.
3. **Conflict:** Only one discount applies — whichever yields the **lower total** (cents).

## Timezone note

Holiday calendar checks use **`DateTime.toUTC()`** so they align with typical **`toISOString()`** payloads. If product later requires a fixed business timezone (e.g. US Eastern), centralize zone conversion here rather than in UI components.

## Pitfalls

- Do **not** copy discount math into list/review/checkout separately — always go through **`quoteReservationPricing`** (via **`API.getQuote`**).
- Seed **`Reservation.total_price_cents`** is not recomputed when pricing rules change; treat as historical unless you add a migration or recompute-on-read.
