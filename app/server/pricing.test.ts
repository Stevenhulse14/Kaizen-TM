import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import {
  qualifiesHolidayDiscount,
  qualifiesLongTrip,
  quoteReservationPricing,
} from "./pricing";

// Jan 21 is a fictitious holiday (FICTITIOUS_HOLIDAYS[0])
const HOLIDAY_MONTH = 1;
const HOLIDAY_DAY = 21;

function utc(year: number, month: number, day: number, hour = 0): DateTime {
  return DateTime.utc(year, month, day, hour);
}

// ─── qualifiesHolidayDiscount ────────────────────────────────────────────────

describe("qualifiesHolidayDiscount", () => {
  it("returns true when trip spans a holiday (pickup day before, drop-off day after)", () => {
    const start = utc(2024, HOLIDAY_MONTH, HOLIDAY_DAY - 1, 10); // Jan 20
    const end = utc(2024, HOLIDAY_MONTH, HOLIDAY_DAY + 1, 10);   // Jan 22
    expect(qualifiesHolidayDiscount(start, end)).toBe(true);
  });

  it("returns false when pickup instant is on the holiday date", () => {
    const start = utc(2024, HOLIDAY_MONTH, HOLIDAY_DAY, 8);      // Jan 21
    const end = utc(2024, HOLIDAY_MONTH, HOLIDAY_DAY + 2, 8);    // Jan 23
    expect(qualifiesHolidayDiscount(start, end)).toBe(false);
  });

  it("returns false when drop-off instant is on the holiday date", () => {
    const start = utc(2024, HOLIDAY_MONTH, HOLIDAY_DAY - 2, 8);  // Jan 19
    const end = utc(2024, HOLIDAY_MONTH, HOLIDAY_DAY, 18);        // Jan 21
    expect(qualifiesHolidayDiscount(start, end)).toBe(false);
  });

  it("returns false when trip does not overlap any holiday", () => {
    const start = utc(2024, HOLIDAY_MONTH, HOLIDAY_DAY + 1, 0);  // Jan 22
    const end = utc(2024, HOLIDAY_MONTH, HOLIDAY_DAY + 3, 0);    // Jan 24
    expect(qualifiesHolidayDiscount(start, end)).toBe(false);
  });

  it("returns true when trip spans a holiday across a year boundary", () => {
    // Dec 18 is also a fictitious holiday — span it from Dec 17 to Dec 19
    const start = utc(2024, 12, 17, 12);
    const end = utc(2024, 12, 19, 12);
    expect(qualifiesHolidayDiscount(start, end)).toBe(true);
  });
});

// ─── qualifiesLongTrip ───────────────────────────────────────────────────────

describe("qualifiesLongTrip", () => {
  it("returns false for exactly 72 hours", () => {
    const start = utc(2024, 3, 1, 0);
    const end = utc(2024, 3, 4, 0); // exactly 72h
    expect(qualifiesLongTrip(start, end)).toBe(false);
  });

  it("returns true for 72 hours and 1 minute", () => {
    const start = utc(2024, 3, 1, 0);
    const end = DateTime.utc(2024, 3, 4, 0, 1); // 72h 1m
    expect(qualifiesLongTrip(start, end)).toBe(true);
  });

  it("returns true for a 4-day trip", () => {
    const start = utc(2024, 3, 1, 0);
    const end = utc(2024, 3, 5, 0); // 96h
    expect(qualifiesLongTrip(start, end)).toBe(true);
  });

  it("returns false for a 1-day trip", () => {
    const start = utc(2024, 3, 1, 0);
    const end = utc(2024, 3, 2, 0); // 24h
    expect(qualifiesLongTrip(start, end)).toBe(false);
  });
});

// ─── quoteReservationPricing ─────────────────────────────────────────────────

describe("quoteReservationPricing", () => {
  const hourlyRateCents = 10_000; // $100/hr

  it("returns no discount when neither rule applies", () => {
    // 24h trip, no holiday overlap
    const start = utc(2024, 3, 10, 0);
    const end = utc(2024, 3, 11, 0);
    const quote = quoteReservationPricing({ start, end, hourlyRateCents });
    expect(quote.discount).toBe("none");
    expect(quote.totalPriceCents).toBe(quote.baseTotalPriceCents);
    expect(quote.effectiveHourlyRateCents).toBe(hourlyRateCents);
  });

  it("applies holiday discount (17% off) when only holiday qualifies", () => {
    // 48h spanning Jan 21 — too short for long-trip
    const start = utc(2024, HOLIDAY_MONTH, HOLIDAY_DAY - 1, 12);
    const end = utc(2024, HOLIDAY_MONTH, HOLIDAY_DAY + 1, 12);
    const quote = quoteReservationPricing({ start, end, hourlyRateCents });
    expect(quote.discount).toBe("holiday_17pct");
    expect(quote.totalPriceCents).toBe(Math.round(quote.baseTotalPriceCents * 0.83));
    expect(quote.effectiveHourlyRateCents).toBe(Math.round(hourlyRateCents * 0.83));
  });

  it("applies long-trip discount ($10/hr off) when only long-trip qualifies", () => {
    // 96h trip, no holiday overlap (March 10–14, no holidays)
    const start = utc(2024, 3, 10, 0);
    const end = utc(2024, 3, 14, 0);
    const quote = quoteReservationPricing({ start, end, hourlyRateCents });
    expect(quote.discount).toBe("long_trip_10hr");
    expect(quote.effectiveHourlyRateCents).toBe(hourlyRateCents - 1000);
    expect(quote.totalPriceCents).toBe((hourlyRateCents - 1000) * 96);
  });

  it("picks the cheaper discount when both qualify", () => {
    // 96h trip spanning Jan 21 — both discounts apply, pick whichever is cheaper
    const start = utc(2024, HOLIDAY_MONTH, HOLIDAY_DAY - 2, 12);
    const end = utc(2024, HOLIDAY_MONTH, HOLIDAY_DAY + 2, 12);
    const durationHours = 96;
    const baseCents = hourlyRateCents * durationHours;
    const holidayTotal = Math.round(baseCents * 0.83);
    const longTripTotal = (hourlyRateCents - 1000) * durationHours;

    const quote = quoteReservationPricing({ start, end, hourlyRateCents });
    const expectedTotal = Math.min(holidayTotal, longTripTotal);
    expect(quote.totalPriceCents).toBe(expectedTotal);
  });

  it("caps effectiveHourlyRateCents at 0 when listed rate is below $10/hr", () => {
    const cheapRate = 500; // $5/hr
    const start = utc(2024, 3, 10, 0);
    const end = utc(2024, 3, 14, 0); // 96h
    const quote = quoteReservationPricing({ start, end, hourlyRateCents: cheapRate });
    expect(quote.effectiveHourlyRateCents).toBe(0);
    expect(quote.totalPriceCents).toBe(0);
  });
});
