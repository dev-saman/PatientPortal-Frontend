/**
 * Utility to decode Base64-encoded email link URL parameters.
 * 
 * URL format: /?Zm9ybQ=MTM&ZmxhZw=bm9fdXNlcg&...
 * Each key and value is Base64 encoded.
 * 
 * Decoded result example:
 * {
 *   form: "13",
 *   flag: "no_user",
 *   patient_id: "10006007",
 *   case_id: "10006243",
 *   funnel_name: "MC/MA NPPW",
 *   name: "Test Testfront",
 *   email: "abhishek-chorge@samantechnosys.com",
 *   phone: "662-360-6110"
 * }
 */

export interface DecodedEmailLinkData {
  form: string;
  flag: string;
  patient_id: string;
  case_id: string;
  funnel_name: string;
  name: string;
  email: string;
  phone: string;
  [key: string]: string; // Allow additional decoded fields
}

/**
 * Safely decode a Base64 string.
 * Adds missing padding so browsers that enforce strict base64 (e.g. Safari)
 * don't throw on URL-encoded params that omit trailing "=" characters.
 * Returns null if decoding still fails after padding.
 */
function safeAtob(encoded: string): string | null {
  try {
    // base64 strings must be a multiple of 4 chars; add "=" padding as needed.
    const padded = encoded + "===".slice((encoded.length + 3) % 4 || 4);
    return atob(padded);
  } catch {
    return null;
  }
}

/**
 * Check if a URL search string contains Base64-encoded email link params.
 * Heuristic: checks if the first key decodes to a known field name.
 */
export function isEncodedEmailLink(search: string): boolean {
  if (!search || search.length < 5) return false;

  // Remove leading "?" if present
  const queryString = search.startsWith("?") ? search.slice(1) : search;
  
  // Split into key=value pairs
  const pairs = queryString.split("&");
  if (pairs.length < 2) return false;

  // Try to decode the first key - check if it resolves to a known field
  const firstPair = pairs[0].split("=");
  if (firstPair.length < 1) return false;

  const decodedKey = safeAtob(firstPair[0]);
  if (!decodedKey) return false;

  const knownKeys = ["form", "flag", "patient_id", "case_id", "funnel_name", "name", "email", "phone"];
  return knownKeys.includes(decodedKey);
}

/**
 * Decode all Base64-encoded key-value pairs from a URL search string.
 * Returns null if decoding fails or data is invalid.
 */
export function decodeEmailLinkParams(search: string): DecodedEmailLinkData | null {
  try {
    if (!search) return null;

    // Remove leading "?" if present
    const queryString = search.startsWith("?") ? search.slice(1) : search;

    // Split into key=value pairs
    const pairs = queryString.split("&");
    if (pairs.length < 2) return null;

    const decoded: Record<string, string> = {};

    for (const pair of pairs) {
      // Split on first "=" only (value may contain "=")
      const eqIndex = pair.indexOf("=");
      if (eqIndex === -1) continue;

      const encodedKey = pair.slice(0, eqIndex);
      const encodedValue = pair.slice(eqIndex + 1);

      const decodedKey = safeAtob(encodedKey);
      const decodedValue = safeAtob(encodedValue);

      if (decodedKey && decodedValue !== null) {
        decoded[decodedKey] = decodedValue;
      }
    }

    // Validate required fields - only form and flag are strictly required
    const requiredFields = ["form", "flag"];
    const hasRequiredFields = requiredFields.every((field) => decoded[field]);

    if (!hasRequiredFields) return null;

    return decoded as DecodedEmailLinkData;
  } catch {
    return null;
  }
}

/**
 * Session storage key for decoded email link data
 */
export const EMAIL_LINK_SESSION_KEY = "ahcs_email_link_data";

/**
 * Store decoded data in sessionStorage
 */
export function storeEmailLinkData(data: DecodedEmailLinkData): void {
  sessionStorage.setItem(EMAIL_LINK_SESSION_KEY, JSON.stringify(data));
}

/**
 * Retrieve decoded data from sessionStorage
 */
export function getEmailLinkData(): DecodedEmailLinkData | null {
  try {
    const stored = sessionStorage.getItem(EMAIL_LINK_SESSION_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as DecodedEmailLinkData;
  } catch {
    return null;
  }
}

/**
 * Clear decoded data from sessionStorage
 */
export function clearEmailLinkData(): void {
  sessionStorage.removeItem(EMAIL_LINK_SESSION_KEY);
}
