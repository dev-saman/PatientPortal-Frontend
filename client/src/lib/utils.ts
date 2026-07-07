import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Canonical timezone appointment dates are displayed in, independent of the viewer's browser timezone.
export const APP_TIMEZONE = "America/Chicago";

// Parses a YYYY-MM-DD date-only string via regex, never through `new Date(string)`
// (which JS parses as UTC midnight and can roll back a day once converted to local time).
function parseIsoDateOnly(dateString: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!dateString) return null;
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

// Anchors the date at noon UTC so formatting it against APP_TIMEZONE (or any real-world
// timezone offset, which never exceeds +/-14h) always lands on the same calendar day.
function toAnchoredDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function getDayOfWeek(dateString: string | null | undefined): string {
  const parsed = parseIsoDateOnly(dateString);
  if (!parsed) return "";
  return toAnchoredDate(parsed.year, parsed.month, parsed.day).toLocaleDateString("en-US", {
    timeZone: APP_TIMEZONE,
    weekday: "long",
  });
}

export function getMonthShort(dateString: string | null | undefined): string {
  const parsed = parseIsoDateOnly(dateString);
  if (!parsed) return "";
  return toAnchoredDate(parsed.year, parsed.month, parsed.day)
    .toLocaleDateString("en-US", { timeZone: APP_TIMEZONE, month: "short" })
    .toUpperCase();
}

export function getDayOfMonth(dateString: string | null | undefined): string {
  const parsed = parseIsoDateOnly(dateString);
  if (!parsed) return "";
  return String(parsed.day);
}

export function formatWeekdayMonthDay(dateString: string | null | undefined): string {
  const parsed = parseIsoDateOnly(dateString);
  if (!parsed) return dateString || "";
  return toAnchoredDate(parsed.year, parsed.month, parsed.day).toLocaleDateString("en-US", {
    timeZone: APP_TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatMonthDay(dateString: string | null | undefined): string {
  const parsed = parseIsoDateOnly(dateString);
  if (!parsed) return dateString || "";
  return toAnchoredDate(parsed.year, parsed.month, parsed.day).toLocaleDateString("en-US", {
    timeZone: APP_TIMEZONE,
    month: "short",
    day: "numeric",
  });
}

// Sortable local timestamp for chronological appointment ordering. Builds the Date from
// its numeric components (not by parsing a string), so it's never subject to the UTC-parse bug.
export function getAppointmentTimestamp(dateString: string | null | undefined, timeString?: string | null): number {
  const parsed = parseIsoDateOnly(dateString);
  if (!parsed) return Number.MAX_SAFE_INTEGER;
  const timeParts = timeString ? timeString.split(":").map(Number) : [];
  const hours = Number.isFinite(timeParts[0]) ? timeParts[0] : 0;
  const minutes = Number.isFinite(timeParts[1]) ? timeParts[1] : 0;
  return new Date(parsed.year, parsed.month - 1, parsed.day, hours, minutes, 0, 0).getTime();
}

// Formats an API date string (any parseable format) to MM-DD-YYYY for display.
// Returns "" for null/empty/invalid input without throwing.
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  try {
    // Parse YYYY-MM-DD directly to avoid timezone shifting
    const isoMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[2]}-${isoMatch[3]}-${isoMatch[1]}`;
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${mm}-${dd}-${yyyy}`;
  } catch {
    return "";
  }
}
