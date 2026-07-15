import { jwtDecode } from "jwt-decode";
import Apis from "@/lib/Apis";

export const CASE_CONTEXT_CHANGED_EVENT = "ahcs:case-context-changed";

const getCaseIdFromToken = (token: string | null | undefined): string => {
  if (!token) return "";
  try {
    const payload = jwtDecode<Record<string, any>>(token);
    return String(payload?.case_id || payload?.caseId || payload?.selected_case_id || payload?.selectedCaseId || "");
  } catch {
    return "";
  }
};

export const getActiveCaseId = (): string => {
  return localStorage.getItem("ahcs_selected_case_id") || "";
};

/**
 * Returns all patient IDs from the token: the primary patient_id plus every
 * entry in the patient_ids array (a patient can own multiple IDs, e.g. one
 * per case). All values are normalised to strings for comparison.
 */
const getTokenPatientIds = (token: string | null | undefined): string[] => {
  if (!token) return [];
  try {
    const payload = jwtDecode<Record<string, any>>(token);

    const primary = String(payload?.patient_id ?? payload?.patientId ?? "").trim();
    const multi: string[] = Array.isArray(payload?.patient_ids)
      ? (payload.patient_ids as any[]).map((id) => String(id).trim()).filter(Boolean)
      : [];

    const all = new Set<string>(multi);
    if (primary) all.add(primary);
    return Array.from(all);
  } catch {
    return [];
  }
};

/**
 * Returns the logged-in user's primary patient_id from the JWT (the `patient_id`
 * claim, not the multi-id `patient_ids` array). Used to build the
 * appointment-schedule path segment. Empty string when unavailable.
 */
export const getActivePatientId = (): string => {
  const token = localStorage.getItem("ahcs_token");
  if (!token) return "";
  try {
    const payload = jwtDecode<Record<string, any>>(token);
    return String(payload?.patient_id ?? payload?.patientId ?? "").trim();
  } catch {
    return "";
  }
};

/**
 * Defense-in-depth guard for magic links. Returns false ONLY when the link's
 * patient_id is present, the token carries at least one patient_id, and the
 * link's patient_id is not among any of them.
 * A patient token may carry multiple IDs (patient_ids array) so we check all.
 * When either side is missing we cannot compare → allow and let the backend decide.
 */
export const patientIdMatchesToken = (linkPatientId: string | null | undefined): boolean => {
  const normalizedLink = String(linkPatientId ?? "").trim();
  if (!normalizedLink) return true;

  const tokenPatientIds = getTokenPatientIds(localStorage.getItem("ahcs_token"));
  if (tokenPatientIds.length === 0) return true;

  return tokenPatientIds.includes(normalizedLink);
};

const syncUserDataFromToken = (token: string) => {
  try {
    const payload = jwtDecode<Record<string, any>>(token);
    const storedUserData = localStorage.getItem("ahcs_user_data");
    const parsedStoredUserData = storedUserData ? JSON.parse(storedUserData) : {};

    localStorage.setItem(
      "ahcs_user_data",
      JSON.stringify({
        ...parsedStoredUserData,
        id: payload?.id || payload?.sub || parsedStoredUserData?.id || "1",
        name: payload?.name || parsedStoredUserData?.name || "",
        email: payload?.email || parsedStoredUserData?.email || "",
        phone: payload?.phone || parsedStoredUserData?.phone || "",
        role: payload?.role || parsedStoredUserData?.role || "User",
        patient_id: payload?.patient_id ?? payload?.patientId ?? parsedStoredUserData?.patient_id ?? "",
      })
    );
  } catch {
    // Ignore decode/storage errors; token/local case id sync is still valid.
  }
};

export const applyCaseContext = (caseId: string, token?: string) => {
  localStorage.setItem("ahcs_selected_case_id", caseId);

  if (token) {
    localStorage.setItem("ahcs_token", token);
    syncUserDataFromToken(token);
  }

  window.dispatchEvent(
    new CustomEvent(CASE_CONTEXT_CHANGED_EVENT, {
      detail: { caseId, token: token || null },
    })
  );
};

export const ensureCaseContext = async (caseId: string): Promise<{ changed: boolean; token?: string }> => {
  const normalizedCaseId = String(caseId || "").trim();
  if (!normalizedCaseId) {
    throw new Error("Invalid case id");
  }

  const currentCaseId = getActiveCaseId();

  if (currentCaseId && currentCaseId === normalizedCaseId) {
    return { changed: false };
  }

  const response = await Apis.changePatientCase(normalizedCaseId);

  // Normalise: axios wraps the body in response.data; some callers unwrap it already.
  const data = response?.data ?? response;

  // Treat an explicit success:false as a server-side rejection even when the
  // HTTP status is 2xx (some backends return 200 with success:false).
  if (data?.success === false) {
    const msg = data?.message || "change-patient-case returned success:false";
    throw new Error(msg);
  }

  const token: string | undefined = data?.token;
  applyCaseContext(normalizedCaseId, token);

  return { changed: true, token };
};
