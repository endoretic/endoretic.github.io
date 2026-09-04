const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;

function asUtcDate(value: Date | string): Date {
  if (typeof value === "string") {
    const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (calendarDate) {
      return new Date(
        Date.UTC(
          Number(calendarDate[1]),
          Number(calendarDate[2]) - 1,
          Number(calendarDate[3]),
        ),
      );
    }
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date: ${String(value)}`);
  }

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function formatIsoWeekDate(value: Date | string): string {
  const date = asUtcDate(value);
  const isoDay = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - isoDay);

  const weekYear = thursday.getUTCFullYear();
  const januaryFourth = new Date(Date.UTC(weekYear, 0, 4));
  const januaryFourthDay = januaryFourth.getUTCDay() || 7;
  const firstThursday = new Date(januaryFourth);
  firstThursday.setUTCDate(
    januaryFourth.getUTCDate() + 4 - januaryFourthDay,
  );

  const week =
    1 +
    Math.round(
      (thursday.getTime() - firstThursday.getTime()) / millisecondsPerWeek,
    );

  return `${String(weekYear).padStart(4, "0")}-W${String(week).padStart(2, "0")}-${isoDay}`;
}

export function formatHtmlDate(value: Date | string): string {
  return asUtcDate(value).toISOString().slice(0, 10);
}
