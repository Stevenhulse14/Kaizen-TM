import { DateTime } from "luxon";
import { FICTITIOUS_HOLIDAYS } from "./holidays";

/** More than 3 full days → strict ceiling on duration (72 hours). */
const LONG_TRIP_THRESHOLD_HOURS = 3 * 24;

/** 17% off total → customer pays 83%. */
const HOLIDAY_DISCOUNT_FACTOR = 0.83;

/** $10/hr in cents */
const LONG_TRIP_HOURLY_DISCOUNT_CENTS = 10 * 100;

export type AppliedDiscount = "holiday_17pct" | "long_trip_10hr" | "none";

export type ReservationQuote = {
  durationHours: number;
  baseHourlyRateCents: number;
  baseTotalPriceCents: number;
  totalPriceCents: number;
  effectiveHourlyRateCents: number;
  discount: AppliedDiscount;
};

function utcMonthDay(dt: DateTime): { month: number; day: number } {
  const u = dt.toUTC();
  return { month: u.month, day: u.day };
}

function isInstantOnHolidayCalendarDay(
  dt: DateTime,
  holidayMonth: number,
  holidayDay: number,
): boolean {
  const { month, day } = utcMonthDay(dt);
  return month === holidayMonth && day === holidayDay;
}

/** True if [rangeStart, rangeEnd] intersects the UTC calendar day (half-open [dayStart, dayEnd)). */
function overlapsUtcCalendarDay(
  rangeStart: DateTime,
  rangeEnd: DateTime,
  year: number,
  month: number,
  day: number,
): boolean {
  const dayStart = DateTime.utc(year, month, day, 0, 0, 0);
  if (!dayStart.isValid) return false;
  const dayEnd = dayStart.plus({ days: 1 });
  return rangeStart < dayEnd && rangeEnd > dayStart;
}

/**
 * Holiday discount applies only if some fictitious holiday UTC calendar day is strictly inside the trip:
 * pickup is not on that holiday date, drop-off is not on that holiday date, but the rental interval overlaps that day.
 */
export function qualifiesHolidayDiscount(start: DateTime, end: DateTime): boolean {
  for (const { month, day } of FICTITIOUS_HOLIDAYS) {
    if (isInstantOnHolidayCalendarDay(start, month, day)) continue;
    if (isInstantOnHolidayCalendarDay(end, month, day)) continue;

    const minY = start.year;
    const maxY = end.year;
    for (let y = minY - 1; y <= maxY + 1; y++) {
      if (overlapsUtcCalendarDay(start, end, y, month, day)) {
        return true;
      }
    }
  }
  return false;
}

export function qualifiesLongTrip(start: DateTime, end: DateTime): boolean {
  const hours = end.diff(start, "hours").hours || 0;
  return hours > LONG_TRIP_THRESHOLD_HOURS;
}

function pickCheaper(a: ReservationQuote, b: ReservationQuote): ReservationQuote {
  return b.totalPriceCents < a.totalPriceCents ? b : a;
}

function buildBaseQuote(
  durationHours: number,
  hourlyRateCents: number,
  baseTotalPriceCents: number,
): ReservationQuote {
  return {
    durationHours,
    baseHourlyRateCents: hourlyRateCents,
    baseTotalPriceCents,
    totalPriceCents: baseTotalPriceCents,
    effectiveHourlyRateCents: hourlyRateCents,
    discount: "none",
  };
}

function buildHolidayQuote(
  durationHours: number,
  hourlyRateCents: number,
  baseTotalPriceCents: number,
): ReservationQuote {
  const effectiveHourlyRateCents = Math.round(hourlyRateCents * HOLIDAY_DISCOUNT_FACTOR);
  const totalPriceCents = Math.round(baseTotalPriceCents * HOLIDAY_DISCOUNT_FACTOR);
  return {
    durationHours,
    baseHourlyRateCents: hourlyRateCents,
    baseTotalPriceCents,
    totalPriceCents,
    effectiveHourlyRateCents,
    discount: "holiday_17pct",
  };
}

function buildLongTripQuote(
  durationHours: number,
  hourlyRateCents: number,
  baseTotalPriceCents: number,
): ReservationQuote {
  const effectiveHourlyRateCents = Math.max(0, hourlyRateCents - LONG_TRIP_HOURLY_DISCOUNT_CENTS);
  const totalPriceCents = Math.round(effectiveHourlyRateCents * durationHours);
  return {
    durationHours,
    baseHourlyRateCents: hourlyRateCents,
    baseTotalPriceCents,
    totalPriceCents,
    effectiveHourlyRateCents,
    discount: "long_trip_10hr",
  };
}

export function quoteReservationPricing(input: {
  start: DateTime;
  end: DateTime;
  hourlyRateCents: number;
}): ReservationQuote {
  const { start, end, hourlyRateCents } = input;
  const durationHours = end.diff(start, "hours").hours || 0;
  const baseTotalPriceCents = Math.round(hourlyRateCents * durationHours);

  let best = buildBaseQuote(durationHours, hourlyRateCents, baseTotalPriceCents);

  if (qualifiesHolidayDiscount(start, end)) {
    best = pickCheaper(best, buildHolidayQuote(durationHours, hourlyRateCents, baseTotalPriceCents));
  }

  if (qualifiesLongTrip(start, end)) {
    best = pickCheaper(best, buildLongTripQuote(durationHours, hourlyRateCents, baseTotalPriceCents));
  }

  return best;
}
