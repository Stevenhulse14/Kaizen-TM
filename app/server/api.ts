/**
 * Server-side domain API consumed by the UI (search, quotes, lookups).
 * Error strings thrown here are intentional signals for callers; `searchVehicles`
 * is the exception—it catches validation failures and returns an empty list (see below).
 */
import { DateTime } from "luxon";
import {
  getAvailableVehicles,
  getReservationById,
  getVehicleById,
  getVehicles,
} from "./data_helpers";

/** Parses ISO strings from the client and enforces ordering. */
const parseAndValidateTimeRange = (startTime: string, endTime: string) => {
  const start = DateTime.fromISO(startTime);
  const end = DateTime.fromISO(endTime);

  // Luxon invalid DateTimes stringify like this; `isValid` is the idiomatic check but this matches existing behavior.
  if (
    start.toString() === "Invalid Date" ||
    end.toString() === "Invalid Date"
  ) {
    throw new Error(
      "BAD REQUEST: Invalid date format. Please use ISO 8601 format.",
    );
  }

  if (end <= start) {
    throw new Error("BAD REQUEST: end_time must be after start_time");
  }
  return { start, end };
};

/** Quote math: duration × hourly rate (both from validated interval). */
const calculateTotalPrice = (
  start: DateTime,
  end: DateTime,
  hourlyRateCents: number,
) => {
  // `diff(..., "hours").hours` is a floating-point hour count; `|| 0` guards a zero edge case.
  const durationInHours = end.diff(start, "hours").hours || 0;

  return {
    totalPriceCents: hourlyRateCents * durationInHours,
    hourlyRateCents,
    durationInHours,
  };
};

/** Shared path for quote/booking flows: valid window + vehicle must exist. */
const validateReservationAndGetVehicle = (input: {
  vehicleId: string;
  startTime: string;
  endTime: string;
}) => {
  const { vehicleId, startTime, endTime } = input;
  const { start, end } = parseAndValidateTimeRange(startTime, endTime);

  const vehicle = getVehicleById(vehicleId);

  if (!vehicle) {
    throw new Error("NOT_FOUND: Vehicle not found");
  }

  return { vehicle, start, end };
};

/**
 * Filters vehicles for the search UI. Invalid dates or thrown errors become an empty list
 * (logged)—when debugging "no results", check console and validate ISO inputs first.
 */
function searchVehicles(input: {
  startTime: string;
  endTime: string;
  passengerCount: number;
  classifications: string[];
  makes: string[];
  priceMin: number;
  priceMax: number;
}) {
  const {
    startTime,
    endTime,
    passengerCount,
    classifications,
    makes,
    priceMin,
    priceMax,
  } = input;

  const parsedPriceMin = priceMin;
  // UI slider uses 100 as the max tick; treat it as "no upper cap" for filtering.
  const parsedPriceMax = priceMax === 100 ? Number.MAX_SAFE_INTEGER : priceMax;

  try {
    const { start, end } = parseAndValidateTimeRange(startTime, endTime);

    const availableVehicles = getAvailableVehicles({
      startTime: start,
      endTime: end,
      passengerCount,
      classifications,
      makes,
      priceMinDollars: parsedPriceMin,
      priceMaxDollars: parsedPriceMax,
    });

    return {
      vehicles: availableVehicles,
    };
  } catch (error) {
    // Swallows BAD REQUEST / unexpected failures so the grid keeps rendering; pair with console below when debugging.
    console.error(error);
    return {
      vehicles: [],
    };
  }
}

export interface FilterOptions {
  makes: string[];
  classifications: string[];
  passengerCounts: number[];
}

/** Builds distinct filter choices from the static vehicle catalog. */
function getFilterOptions(): FilterOptions {
  const allVehicles = getVehicles();

  const uniqueMakes = [...new Set(allVehicles.map((v) => v.make))].sort();
  const uniqueClassifications = [
    ...new Set(allVehicles.map((v) => v.classification)),
  ].sort();
  const uniquePassengerCounts = [
    ...new Set(allVehicles.map((v) => v.max_passengers)),
  ].sort((a, b) => a - b);

  return {
    makes: uniqueMakes,
    classifications: uniqueClassifications,
    passengerCounts: uniquePassengerCounts,
  };
}

/** Throws NOT_FOUND when id is missing from seed data. */
function getVehicle(id: string) {
  const vehicle = getVehicleById(id);

  if (!vehicle) {
    throw new Error("NOT_FOUND: Vehicle not found");
  }

  return vehicle;
}

/** Throws NOT_FOUND when reservation id is missing from seed data. */
function getReservation(id: string) {
  const reservation = getReservationById(id);
  if (!reservation) {
    throw new Error("NOT_FOUND: Reservation not found");
  }
  return reservation;
}

/** Price preview for a vehicle + time window (no persistence). */
function getQuote(input: {
  vehicleId: string;
  startTime: string;
  endTime: string;
}) {
  const { vehicle, start, end } = validateReservationAndGetVehicle(input);
  return calculateTotalPrice(start, end, vehicle.hourly_rate_cents);
}

export const API = {
  searchVehicles,
  getFilterOptions,
  getVehicle,
  getReservation,
  getQuote,
};
