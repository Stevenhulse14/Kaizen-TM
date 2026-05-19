/** Upper bound of the hourly rate slider ($/hr); must be ≥ max fleet rate in seed data (~$220). */
export const PRICE_FILTER_SLIDER_MAX_DOLLARS = 250;

export interface FormValues {
  startDate: Date;
  startTime: string;
  endDate: Date;
  endTime: string;
  price: [number, number];
  minPassengers: number;
  make: string[];
  classification: string[];
}

/** Merges calendar date + `HH:mm` into one local `Date` for ISO serialization to the API. */
export const combineDateTime = (date: Date, time: string) => {
  const [hours, minutes] = time.split(":");
  const combinedDate = new Date(date);
  combinedDate.setHours(parseInt(hours), parseInt(minutes));
  return combinedDate;
};
