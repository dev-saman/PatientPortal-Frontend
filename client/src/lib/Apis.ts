import { Network } from "./network";
import { getActiveCaseId } from "./api";

/**
 * Centralized API class
 * All API calls are structured as static methods for easy access and maintenance
 * Example: Apis.login(data), Apis.getPatientDetails()
 */
export default class Apis {
  static verifyMagicLink = (patientId: string) => {
    const formData = new FormData();
    formData.append("patient_id", patientId);
    return Network<{ flag?: string }>("POST", "magic-link/verify", formData, true);
  };

  /**
   * Get patient details
   * @returns Patient details response
   */
  static getPatientDetails = () => {
    return Network("GET", "get-patient-details");
  };

  /**
   * Get patient appointments (upcoming and past)
   * @returns Appointments response with upcoming_appointments and past_appointments
   */
  static getPatientAppointments = () => {
    return Network("GET", "get-patient-appointments");
  };

  /**
   * User login
   * @param data - FormData with email and password
   * @returns Login response with token
   */
  static login = (data: FormData) => {
    return Network("POST", "login", data, true); // isMultipart=true for FormData
  };

  /**
   * User logout
   * Passes token to end user session on the backend
   * @returns Logout response
   */
  static logout = () => {
    const token = localStorage.getItem("ahcs_token");
    return Network("POST", "logout", { token });
  };

  /**
   * Get patient submitted form data
   * @returns Form data response with form_title, created_at, funnel_name, pdf_url, etc.
   */
  static getPatientSubmittedFormData = () => {
    return Network("GET", "get-patient-submited-form-data");
  };

  /**
   * Get patient funnels
   * @returns Patient funnels response with funnel list data
   */
  static getPatientFunnels = () => {
    return Network("GET", "get-patient-funnels");
  };

  /**
   * Get case IDs by email
   * @param email - The logged-in user's email address
   * @returns Case IDs response with list of case IDs for the user
   */
  static getCaseIdsByEmail = (email: string) => {
    return Network("GET", "get-case-ids-by-email", { email });
  };

  /**
   * Get patient funnel submission details
   * @param funnelId - Patient funnel id from get-patient-funnels response
   * @returns Patient funnel submission details response
   */
  static getPatientFunnelSubmissionDetails = (funnelId: string | number) => {
    return Network("GET", `get-patient-funnel-submission-details/${funnelId}`);
  };

  /**
   * Submit patient form data
   * @param formId - The form ID to submit
   * @param data - FormData with funnel_id and fields[fieldId] values
   * @returns Submission response
   */
  static assignPatientFormSubmission = (formId: string | number, data: FormData) => {
    return Network("POST", `patient-forms/${formId}/submit`, data, true);
  };

  /**
   * Get patient form data (New Platform)
   * @returns Clinical documents/form data response
   */
  static getPatientFormData = () => {
    return Network("GET", "get-patient-form-data");
  };

  /**
   * Download selected patient submitted form PDFs as a ZIP file
   * @param pdfUrls - PDF file names/URLs collected from submitted form data
   * @returns ZIP file blob
   */
  /**
   * Add a note on a submission form
   * @param submissionId - The form submission ID
   * @param data - FormData containing the note
   * @returns API response
   */
  static addNoteOnSubmissionForm = (submissionId: string | number, data: FormData) => {
    return Network("POST", `form-submissions/${submissionId}/notes`, data, true);
  };

  /**
   * Get submission form notes (comments history)
   * @param submissionId - The form submission ID
   * @returns Notes/comments history response
   */
  static getSubmissionFormNotes = (submissionId: string | number) => {
    return Network("GET", `form-submissions/${submissionId}/notes`);
  };

  static downloadPatientSubmittedFormPDF = (pdfUrls: string[]) => {
    return Network<Blob>(
      "POST",
      "download-patient-submited-form-pdf",
      { pdfUrls },
      false,
      { responseType: "blob" }
    );
  };

  /**
   * Download patient form PDF (New Platform / Clinical Documents)
   * @param pdfUrls - Array of PDF file names/URLs
   * @returns PDF or ZIP file blob
   */
  static downloadPatientFormPDF = (pdfUrls: string[]) => {
    const caseId = getActiveCaseId();
    return Network<Blob>(
      "POST",
      "download-patient-form-pdf",
      { pdfUrls, case_id: caseId },
      false,
      { responseType: "blob" }
    );
  };

  /**
   * Get clinical documents for the currently active case using the new API.
   * case_id is injected automatically by the request interceptor.
   */
  static getClinical = () => {
    return Network("GET", "get-clinical");
  };

  /**
   * Fetch a clinical document PDF from an absolute URL (view_pdf_url / download_pdf_url).
   * Uses the same axios instance so the Authorization header is attached automatically.
   */
  static getClinicalDocumentBlob = (url: string) => {
    return Network<Blob>("GET", url, undefined, false, { responseType: "blob" });
  };

  static getAdministratorNotes = () => {
    return Network("GET", "get-administrator-notes");
  };

  /**
   * Get file preview for an Administrative (file_notes) item
   * Endpoint: /attach/preview/{caseId}/{folder}/{subFolder}/{filename}
   */
  static getClinicalNoteFilePreview = (folder: string, subFolder: string, filename: string) => {
    const caseId = getActiveCaseId();
    const path = `attach/preview/${encodeURIComponent(caseId)}/${encodeURIComponent(folder)}/${encodeURIComponent(subFolder)}/${encodeURIComponent(filename)}`;
    return Network<Blob>("GET", path, undefined, false, { responseType: "blob" });
  };

  /**
   * Send forgot password email
   * @param email - The email address to send the reset link to
   * @returns API response with success message
   */
  static forgotPassword = (email: string) => {
    return Network("POST", "password/forgot", undefined, false, { params: { email } });
  };

  /**
   * Reset password via forgot-password email link
   * @param email - User email
   * @param token - Reset token from the email link
   * @param password - New password
   * @param confirmPassword - Confirmation of new password
   * @returns API response with success message
   */
  static resetPassword = (email: string, token: string, password: string, confirmPassword: string, source?: string) => {
    const formData = new FormData();
    formData.append("email", email);
    formData.append("token", token);
    formData.append("password", password);
    formData.append("password_confirmation", confirmPassword);
    if (source) formData.append("source", source);
    return Network("POST", "password/reset", formData, true);
  };

  /**
   * Change patient case ID
   * @param caseId - The case ID to switch to
   * @returns API response
   */
  static changePatientCase = (caseId: string) => {
    const formData = new FormData();
    formData.append("case_id", caseId);
    return Network("POST", "change-patient-case", formData, true);
  };

  /**
   * Get recent activity for the active case
   * @param limit - Maximum number of activity items to return
   * @returns Recent activity response
   */
  static getRecentActivity = (limit: number = 5) => {
    return Network("GET", "recent-activity", { limit });
  };

  /**
   * Get appointment departments for the Location dropdown in Schedule Appointment modal
   * @returns Departments response with list of department options
   */
  static getAppointmentDepartments = () => {
    return Network("GET", "get-appointment-departments");
  };

  static getDepartmentSpecialityWithPhysician = (department: string) => {
    return Network("GET", `get-department-speciality-with-physician?department=${encodeURIComponent(department)}`);
  };

  /**
   * Get company and provider ID options based on department and physician
   * @param department - The selected location/department name
   * @param providerId - The physician_id from the selected provider
   * @returns Response with amd_company_name and amd_code fields
   */
  static getCompanyByDepartmentAndProvider = (department: string, providerId: number | string) => {
    return Network("GET", `get-company-by-department-and-provider?department=${encodeURIComponent(department)}&provider_id=${encodeURIComponent(providerId)}`);
  };

  // case_id is injected automatically by the request interceptor
  static getApprovedPreauth = () => {
    return Network("GET", "get-approved-preauth");
  };

  // Exempt from interceptor; case_id and ma_id come from the get-approved-preauth response
  static checkSessionsCompleted = (caseId: string, maId: string | number) => {
    return Network("GET", `check-sessions-completed?case_id=${encodeURIComponent(caseId)}&ma_id=${encodeURIComponent(maId)}`);
  };

  /**
   * Get the list of proxies for the current patient
   * @returns Proxy list response with proxies array
   */
  static getProxyList = () => {
    return Network("GET", "proxy/list");
  };

  /**
   * Revoke a proxy by ID
   * @param proxyId - The ID of the proxy to revoke
   * @returns API response
   */
  static revokeProxy = (proxyId: number) => {
    return Network("DELETE", `proxy/${proxyId}/revoke`);
  };

  /**
   * Get access history for a specific proxy
   * @param proxyId - The ID of the proxy
   * @returns Proxy history response
   */
  static getProxyHistory = (proxyId: number) => {
    return Network("GET", `proxy/${proxyId}/history`);
  };

  /**
   * Send a proxy invitation email
   * @param email - The email address to invite as a proxy
   * @returns API response
   */
  static sendProxyInvite = (email: string) => {
    const formData = new FormData();
    formData.append("email", email);
    return Network("POST", "proxy/invite", formData, true);
  };

  static getAppointment = (apptId: number | string) => {
    return Network("GET", `get-appointment?appt_id=${encodeURIComponent(apptId)}`);
  };

  static getAppointmentReasons = () => {
    return Network("GET", "get-appointment-reasons");
  };

  static rescheduleAppointment = (
    apptId: number | string,
    maId: number | string,
    payload: {
      department: string;
      service: string;
      provider_name: string;
      provider_id: number | string;
      attend_type: string;
      attend_status: string;
      attend_date: string;
      time: string;
      end_time: string;
      attend_notes: string;
      attend_reason_id: number | string;
    },
  ) => {
    const formData = new FormData();
    formData.append("department", payload.department);
    formData.append("service", payload.service);
    formData.append("provider_name", payload.provider_name);
    formData.append("provider_id", String(payload.provider_id));
    formData.append("attend_type", payload.attend_type);
    formData.append("attend_status", payload.attend_status);
    formData.append("attend_date", payload.attend_date);
    formData.append("time", payload.time);
    formData.append("end_time", payload.end_time);
    formData.append("attend_notes", payload.attend_notes);
    formData.append("attend_reason_id", String(payload.attend_reason_id));
    const caseId = getActiveCaseId();
    return Network(
      "POST",
      `appointment-reschedule?case_id=${encodeURIComponent(caseId)}&appt_id=${encodeURIComponent(apptId)}&ma_id=${encodeURIComponent(maId)}`,
      formData,
      true,
    );
  };

  static getAvailableTimeSlots = (
    providerId: number | string,
    location: string,
    date: string,
    startTime: string,
    caseId: string,
  ) => {
    return Network(
      "GET",
      `available-time-slots?provider_id=${encodeURIComponent(providerId)}&location=${encodeURIComponent(location)}&date=${encodeURIComponent(date)}&start_time=${encodeURIComponent(startTime)}&case_id=${encodeURIComponent(caseId)}`,
    );
  };

  static getTimeSlotDateRange = (
    providerId: number | string,
    location: string,
    svcDateStart: string,
    svcDateEnd: string,
    caseId: string,
  ) => {
    return Network(
      "GET",
      `get-time-slots-date-range?provider_id=${encodeURIComponent(providerId)}&location=${encodeURIComponent(location)}&svc_date_start=${encodeURIComponent(svcDateStart)}&svc_date_end=${encodeURIComponent(svcDateEnd)}&case_id=${encodeURIComponent(caseId)}`,
    );
  };
}
