import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
