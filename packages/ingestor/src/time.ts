const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** London-local parts of a Date, honouring BST/GMT via Intl. */
function londonParts(d: Date): { weekday: string; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
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
