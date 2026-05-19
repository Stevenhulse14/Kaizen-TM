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

export function quoteReservationPricing(input: {
  start: DateTime;
  end: DateTime;
  hourlyRateCents: number;
}): ReservationQuote {
  const { start, end, hourlyRateCents } = input;
  const durationHours = end.diff(start, "hours").hours || 0;

  const baseTotalPriceCents = Math.round(hourlyRateCents * durationHours);

  const holidayOk = qualifiesHolidayDiscount(start, end);
  const longTripOk = qualifiesLongTrip(start, end);

  const holidayTotalCents = Math.round(baseTotalPriceCents * HOLIDAY_DISCOUNT_FACTOR);

  const reducedHourly = Math.max(0, hourlyRateCents - LONG_TRIP_HOURLY_DISCOUNT_CENTS);
  const longTripTotalCents = Math.round(reducedHourly * durationHours);

  let best: ReservationQuote = {
    durationHours,
    baseHourlyRateCents: hourlyRateCents,
    baseTotalPriceCents,
    totalPriceCents: baseTotalPriceCents,
    effectiveHourlyRateCents: hourlyRateCents,
    discount: "none",
  };

  if (holidayOk) {
    const impliedHourly =
      durationHours > 0 ? Math.round(holidayTotalCents / durationHours) : hourlyRateCents;
    const candidate: ReservationQuote = {
      durationHours,
      baseHourlyRateCents: hourlyRateCents,
      baseTotalPriceCents,
      totalPriceCents: holidayTotalCents,
      effectiveHourlyRateCents: impliedHourly,
      discount: "holiday_17pct",
    };
    if (candidate.totalPriceCents < best.totalPriceCents) best = candidate;
  }

  if (longTripOk) {
    const candidate: ReservationQuote = {
      durationHours,
      baseHourlyRateCents: hourlyRateCents,
      baseTotalPriceCents,
      totalPriceCents: longTripTotalCents,
      effectiveHourlyRateCents: reducedHourly,
      discount: "long_trip_10hr",
    };
    if (candidate.totalPriceCents < best.totalPriceCents) best = candidate;
  }

  return best;
}
