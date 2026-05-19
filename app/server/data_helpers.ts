/**
 * Thin accessors over static seed data (`data.ts`) plus search filtering.
 * When debugging availability: compare requested `[startTime, endTime]` against each reservation interval using the disjoint rule below.
 */
import { DateTime } from "luxon";
import {
  Reservation,
  RESERVATIONS,
  RESERVATIONS_BY_VEHICLE_ID,
  Vehicle,
  VEHICLES,
} from "./data";

export const getVehicleById = (id: string): Vehicle | undefined => {
  return VEHICLES.find((car) => car.id === id);
};

export const getReservationById = (id: string): Reservation | undefined => {
  return RESERVATIONS.find((reservation) => reservation.id === id);
};

/** Vehicles matching filters and with no reservation overlapping the requested window. */
export const getAvailableVehicles = ({
  startTime,
  endTime,
  passengerCount,
  classifications,
  makes,
  priceMinDollars,
  priceMaxDollars,
}: {
  startTime: DateTime;
  endTime: DateTime;
  passengerCount: number;
  classifications: string[];
  makes: string[];
  priceMinDollars: number;
  priceMaxDollars: number;
}) => {
  return VEHICLES.filter((car) => {
    const reservations = RESERVATIONS_BY_VEHICLE_ID[car.id] ?? [];

    // Intervals are disjoint iff existing reservation starts after our window ends OR ends before our window starts.
    const isAvailableWithinTimeRange = reservations.every((reservation) => {
      return (
        reservation.start_time > endTime || reservation.end_time < startTime
      );
    });

    // Filter bounds are dollars from the UI; vehicle rates are stored in cents.
    const matchesPrice =
      car.hourly_rate_cents >= priceMinDollars * 100 &&
      car.hourly_rate_cents <= priceMaxDollars * 100;

    const matchesClassification = classifications.includes(car.classification);

    const matchesMake = makes.includes(car.make);

    const matchesPassengerCount = car.max_passengers >= passengerCount;

    return (
      isAvailableWithinTimeRange &&
      matchesPrice &&
      matchesClassification &&
      matchesMake &&
      matchesPassengerCount
    );
  });
};

export const getVehicles = () => {
  return VEHICLES;
};
