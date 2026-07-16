import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from "axios";
import { MAGIC_LINK_PENDING_REDIRECT_KEY } from "./magicLink";

/**
 * Resolve the currently active case id.
 * Prefers the case id selected in the sidebar (persisted in localStorage),
 * and falls back to the case id embedded in the auth token.
 * Kept local to this module (rather than imported from caseContext) to avoid
 * a circular import: caseContext -> Apis -> network -> api.
 */
/**
 * Endpoints that must NOT receive the case_id query param:
 * - `get-case-ids-by-email` lists every case for the user (it powers the
 *   sidebar selector), so it must stay user-scoped rather than case-scoped.
 * - `get-patient-details` accepts case_id as a query param to return details
 *   for the selected case, so it is intentionally NOT exempt.
 * - `change-patient-case` already carries the target case_id in its body; adding
 *   the currently-active case_id as a query param would conflict with the switch.
 * - auth/session endpoints have no case context.
 */
const CASE_ID_EXEMPT_ENDPOINTS = [
  "get-case-ids-by-email",
  "change-patient-case",
  "login",
  "logout",
  "magic-link",
  "password/forgot",
  "attach/preview",
  "download-patient-form-pdf",
  "download-patient-submited-form-pdf",
  // case_id and ma_id are sourced from the get-approved-preauth response and passed explicitly
  "check-sessions-completed",
  // the preauth's case_id (may differ from the active case) and ma_id are passed explicitly
  "notify-patient-preauth-missing-details",
  // case_id is sourced from the get-approved-preauth response and passed explicitly
  "get-time-slots-date-range",
  // case_id is sourced from the get-approved-preauth response and passed explicitly
  "available-time-slots",
  // case_id is passed explicitly as a query param alongside appt_id and ma_id
  "appointment-reschedule",
  // global/provider-scoped reference data for the reschedule calendar — not case-scoped
  "holidays",
  "vacations/calendar-blocks",
  // case_id (the preauth's, may differ from the active case) is passed explicitly as a path segment
  "appointment-schedule",
  // case_id is passed explicitly as a path segment (and in the body)
  "appointment-cancel",
];

export const getActiveCaseId = (): string => {
  return localStorage.getItem("ahcs_selected_case_id") || "";
};

/**
 * Axios instance with centralized configuration
 * Handles authentication, error handling, and request/response interceptors
 */

// Create axios instance with base configuration
const axiosInstance: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "https://adm.advantagehcs.com/api",
  timeout: 90000,
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
});

/**
 * Request Interceptor
 * Attaches JWT token to every request
 */
axiosInstance.interceptors.request.use(
  (config) => {
    // Get token from localStorage
    const token = localStorage.getItem("ahcs_token");

    // Attach token to Authorization header if available
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Scope requests to the selected case by attaching ?case_id=<selected>.
    // The backend requires this (for both reads and submissions) to operate on the
    // case chosen in the sidebar. Sent as a query param so it reaches Laravel's
    // request input for GET and POST alike. Exempt endpoints are skipped above.
    const url = config.url || "";
    const isCaseIdExempt = CASE_ID_EXEMPT_ENDPOINTS.some((endpoint) => url.includes(endpoint));
    if (!isCaseIdExempt) {
      const caseId = getActiveCaseId();
      if (caseId) {
        config.params = { ...(config.params || {}), case_id: caseId };
      }
    }

    // When sending FormData, delete Content-Type so browser/axios auto-sets
    // multipart/form-data with the correct boundary
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor
 * Handles global error scenarios
 */
axiosInstance.interceptors.response.use(
  (response) => {
    // Return successful response
    return response;
  },
  (error: AxiosError) => {
    // Handle 401 Unauthorized
    if (error.response?.status === 401) {
      const errorData = error.response?.data as any;

      // Check if error message is "Unauthenticated."
      if (errorData?.message === "Unauthenticated." || error.response?.status === 401) {
        // Clear all authentication data from storage
        localStorage.clear();
        const formRedirect = sessionStorage.getItem("ahcs_user_exists_form_redirect");
        const pendingMagicLinkRedirect = sessionStorage.getItem(MAGIC_LINK_PENDING_REDIRECT_KEY);
        sessionStorage.clear();
        if (formRedirect) sessionStorage.setItem("ahcs_user_exists_form_redirect", formRedirect);
        if (pendingMagicLinkRedirect) sessionStorage.setItem(MAGIC_LINK_PENDING_REDIRECT_KEY, pendingMagicLinkRedirect);

        // Only redirect if not already on login page
        // This prevents page reload when login fails with invalid credentials
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    }

    // Return error for UI to handle
    return Promise.reject(error);
  }
);

export default axiosInstance;
