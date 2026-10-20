const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// Built once per isolate: constructing a time-zoned Intl.DateTimeFormat is a
// measurable CPU cost in a cold Worker, and these run several times per tick.
const PARTS_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// en-CA renders ISO-style YYYY-MM-DD.
const DATE_KEY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** London-local parts of a Date, honouring BST/GMT via Intl. */
function londonParts(d: Date): { weekday: string; hour: number; minute: number } {
  const parts = PARTS_FMT.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    weekday: get("weekday"),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

export function londonWeekday(d: Date): string {
  const wd = londonParts(d).weekday;
  // Normalise to our 3-letter form (Intl already returns e.g. "Sat").
  return WEEKDAYS.includes(wd as (typeof WEEKDAYS)[number]) ? wd : wd.slice(0, 3);
}

/** Floor to the enclosing 15-minute band, formatted "HH:MM". */
export function londonBand(d: Date): string {
  const { hour, minute } = londonParts(d);
  const banded = Math.floor(minute / 15) * 15;
  return `${String(hour).padStart(2, "0")}:${String(banded).padStart(2, "0")}`;
}

/** London-local calendar date as "YYYY-MM-DD" (for daily cache rollover). */
export function londonDateKey(d: Date): string {
  return DATE_KEY_FMT.format(d);
}
