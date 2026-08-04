import React, { useEffect, useRef, useState } from "react";
import {
  Calendar,
  MessageSquare,
  FileText,
  CreditCard,
  Activity,
  Clock,
  MapPin,
  Pill,
  Search,
  FilePlus,
  CheckCircle2,
  Eye,
  Download,
  Loader2,
} from "lucide-react";
import PageLoader from "@/components/PageLoader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedCase } from "@/contexts/SelectedCaseContext";
import RecentActivity from "@/components/RecentActivity";
import FormViewModal from "@/components/FormViewModal";
import PatientFunnelAccordion from "@/components/PatientFunnelAccordion";
import { fetchCaseFunnelsWithForms, sumPendingForms, PatientAssignedFunnel } from "@/lib/patientFunnels";
import Apis from "@/lib/Apis";
import { getApiErrorMessage } from "@/lib/apiError";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { formatWeekdayMonthDay, formatMonthDay, getAppointmentTimestamp } from "@/lib/utils";

interface Appointment {
  id: number;
  attend_date: string;
  service_full_name: string;
  attend_type_full_name: string;
  provider_name: string;
  time: string;
  end_time: string;
  department: string;
}

const getAppointmentDateTime = (appointment: Appointment): number =>
  getAppointmentTimestamp(appointment.attend_date, appointment.time);

const formatDashboardDate = (dateString: string): string => {
  return formatWeekdayMonthDay(dateString);
};

const formatDashboardTime = (timeString: string): string => {
  if (!timeString) return "";

  const [hours, minutes] = timeString.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return timeString;

  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const formatShortDate = (dateString: string): string => {
  return formatMonthDay(dateString);
};

export default function PatientDashboard() {
  const { user } = useAuth();
  const { selectedCaseId, caseIdsFetchDone } = useSelectedCase();
  const [, setLocation] = useLocation();
  const [nearestUpcomingAppointment, setNearestUpcomingAppointment] = useState<Appointment | null>(null);
  const [isUpcomingAppointmentLoading, setIsUpcomingAppointmentLoading] = useState(false);
  const [hasNoUpcomingAppointments, setHasNoUpcomingAppointments] = useState(false);
  // Every funnel assigned to the active case (each with its own forms). The
  // single-funnel presentation below reads funnels[0]; 2+ funnels render as a grid.
  const [funnels, setFunnels] = useState<PatientAssignedFunnel[]>([]);
  const [isFunnelFormsLoading, setIsFunnelFormsLoading] = useState(false);
  const [funnelsErrorMsg, setFunnelsErrorMsg] = useState<string | null>(null);
  const [dashboardStartingFunnelId, setDashboardStartingFunnelId] = useState<string | number | null>(null);
  // Monotonic request id so a slow case's response can't overwrite a newer one.
  const funnelsRequestRef = useRef(0);

  // Ready flags for the two APIs fetched directly in this component.
  // RecentActivity is excluded — it mounts after the loader clears and shows
  // its own internal spinner, avoiding a circular mount-dependency deadlock.
  const [appointmentsReady, setAppointmentsReady] = useState(false);
  const [funnelsReady, setFunnelsReady] = useState(false);

  // Full-page loader: stay true until case IDs are fetched AND (if a case exists)
  // both primary API sections have finished loading. When caseIdsFetchDone is true
  // but selectedCaseId is empty (no cases on account), skip waiting for APIs.
  const isDashboardInitializing =
    !caseIdsFetchDone ||
    (!!selectedCaseId && (!appointmentsReady || !funnelsReady));
  const [selectedForm, setSelectedForm] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [funnelFormViewLoadingId, setFunnelFormViewLoadingId] = useState<string | number | null>(null);
  const [funnelFormDownloadLoadingId, setFunnelFormDownloadLoadingId] = useState<string | number | null>(null);

  useEffect(() => {
    if (!selectedCaseId) return;

    const fetchUpcomingAppointment = async () => {
      try {
        setIsUpcomingAppointmentLoading(true);
        const data = await Apis.getPatientAppointments();

        if (!data.success) {
          setHasNoUpcomingAppointments(true);
          return;
        }

        const upcoming = [...(data.upcoming_appointments || [])].sort(
          (a, b) => getAppointmentDateTime(a) - getAppointmentDateTime(b)
        );
        const noUpcomingAppointments = data.upcoming_count === 0 && upcoming.length === 0;

        setNearestUpcomingAppointment(upcoming[0] || null);
        setHasNoUpcomingAppointments(noUpcomingAppointments);
      } catch (error) {
        console.error("Error fetching dashboard appointment:", error);
        toast.error(getApiErrorMessage(error) || "Failed to load appointment data", {
          style: { backgroundColor: "#ef4444", color: "#ffffff" },
        });
      } finally {
        setIsUpcomingAppointmentLoading(false);
        setAppointmentsReady(true);
      }
    };

    fetchUpcomingAppointment();
  }, [selectedCaseId]);

  // Fetch ALL funnels assigned to the active case, each with its own forms.
  // A monotonic request id prevents a slow previous-case response from
  // overwriting the newly selected case's data.
  const loadDashboardFunnels = React.useCallback(async () => {
    const requestId = ++funnelsRequestRef.current;
    try {
      setIsFunnelFormsLoading(true);
      setFunnelsErrorMsg(null);
      const result = await fetchCaseFunnelsWithForms();
      if (requestId !== funnelsRequestRef.current) return; // superseded by a newer case
      setFunnels(result);
    } catch (error) {
      if (requestId !== funnelsRequestRef.current) return;
      const message = getApiErrorMessage(error) || "Failed to load funnel forms";
      console.error("Error fetching dashboard funnels:", error);
      toast.error(message, { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
      setFunnels([]);
      setFunnelsErrorMsg(message);
    } finally {
      if (requestId === funnelsRequestRef.current) {
        setIsFunnelFormsLoading(false);
        setFunnelsReady(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!selectedCaseId) return;
    // Clear the previous case's funnels immediately so they never flash while
    // the new case loads.
    setFunnels([]);
    loadDashboardFunnels();
  }, [selectedCaseId, loadDashboardFunnels]);

  const getFormName = (form: any): string => form?.form_title || form?.form_name || form?.title || form?.name || "Untitled Form";
  const isFormCompleted = (form: any): boolean => form?.submission_status === "completed";
  const getFormId = (form: any): string | number | undefined => form?.id ?? form?.form_id;

  const normalizeClinicalDocuments = (response: any): any[] => {
    const responseCandidates = [response?.data?.data, response?.data, response?.forms, response?.documents, response];
    const rootList = responseCandidates.find((c) => Array.isArray(c));
    if (!Array.isArray(rootList)) return [];
    const normalized: any[] = [];
    rootList.forEach((item: any) => {
      const forms = [item?.cases?.forms, item?.forms].find((c) => Array.isArray(c));
      if (!forms && typeof item === "object" && item !== null) {
        const isFlatForm = item.form_title || item.form_name || item.title || item.name;
        if (isFlatForm) {
          normalized.push({
            ...item,
            id: item.id ?? item.submission_id ?? item.form_submission_id ?? item.form_id,
            form_title: item.form_title || item.form_name || item.title || item.name || "Untitled Document",
            created_at: item.created_at || "",
            funnel_name: item.funnel_name || item.funnel || "",
            pdf_url: item.pdf_url || item.pdfUrl || item.downloadPdf,
            downloadPdf: item.downloadPdf || item.pdf_url || item.pdfUrl,
            decoded_json: item.decoded_json || item.decodedJson || item.json,
            json: item.json || item.decoded_json || item.decodedJson,
          });
        }
        return;
      }
      if (!Array.isArray(forms)) return;
      forms.forEach((form: any) => {
        normalized.push({
          ...form,
          id: form.id ?? form.submission_id ?? form.form_submission_id ?? form.form_id,
          form_title: form.form_title || form.form_name || form.title || form.name || "Untitled Document",
          created_at: form.created_at || "",
          funnel_name: form.funnel_name || item?.cases?.funnel_name || item?.funnel_name || "",
          pdf_url: form.pdf_url || form.pdfUrl || form.downloadPdf,
          downloadPdf: form.downloadPdf || form.pdf_url || form.pdfUrl,
          decoded_json: form.decoded_json || form.decodedJson || form.json,
          json: form.json || form.decoded_json || form.decodedJson,
        });
      });
    });
    return normalized;
  };

  const extractPdfFromResponse = async (responseBlob: Blob): Promise<Blob> => {
    const header = await responseBlob.slice(0, 4).arrayBuffer();
    const bytes = new Uint8Array(header);
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)
      return new Blob([responseBlob], { type: "application/pdf" });
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(responseBlob);
      const pdfFiles = Object.keys(zip.files).filter((n) => n.toLowerCase().endsWith(".pdf"));
      if (pdfFiles.length > 0) {
        const pdfData = await zip.files[pdfFiles[0]].async("blob");
        return new Blob([pdfData], { type: "application/pdf" });
      }
    }
    return new Blob([responseBlob], { type: "application/pdf" });
  };

  const handleViewFunnelForm = async (form: any) => {
    const formName = getFormName(form);
    const formKey = form?.id ?? form?.form_id ?? formName;
    setFunnelFormViewLoadingId(formKey);
    try {
      const response = await Apis.getPatientFormData();
      const normalized = normalizeClinicalDocuments(response);
      const matched =
        normalized.find((f) => (f.form_title || f.title || f.name || "").toLowerCase() === formName.toLowerCase()) ??
        normalized[0];
      if (!matched) {
        toast.error("Form data not available", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
        return;
      }
      setSelectedForm(matched);
      setIsModalOpen(true);
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Failed to load form", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
    } finally {
      setFunnelFormViewLoadingId(null);
    }
  };

  const handleDownloadFunnelFormPDF = async (form: any) => {
    const formName = getFormName(form);
    const formKey = form?.id ?? form?.form_id ?? formName;
    setFunnelFormDownloadLoadingId(formKey);
    try {
      const response = await Apis.getPatientFormData();
      const normalized = normalizeClinicalDocuments(response);
      const matched =
        normalized.find((f) => (f.form_title || f.title || f.name || "").toLowerCase() === formName.toLowerCase()) ??
        normalized[0];
      if (!matched) {
        toast.error("PDF not available", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
        return;
      }
      const rawPdfUrl = (matched.pdf_url || matched.downloadPdf || "").trim();
      if (!rawPdfUrl) {
        toast.error("PDF not available", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
        return;
      }
      const pdfFileName = rawPdfUrl.split("/").pop() || rawPdfUrl;
      const responseBlob = await Apis.downloadPatientFormPDF([pdfFileName]);
      if (!(responseBlob instanceof Blob) || responseBlob.size === 0) {
        throw new Error("The PDF file returned by the server is empty or invalid");
      }
      const pdfBlob = await extractPdfFromResponse(responseBlob);
      const sanitized = formName.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
      const downloadFileName = sanitized ? `${sanitized}.pdf` : "patient-form.pdf";
      const url = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = downloadFileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Download successful", { style: { background: "#16a34a", color: "#fff", border: "none" } });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Failed to download PDF", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
    } finally {
      setFunnelFormDownloadLoadingId(null);
    }
  };

  // Navigate to a specific funnel from the multi-funnel grid. Uses that card's
  // own funnelId (never the first funnel) and guards against double-clicks.
  const handleStartFunnel = (funnel: PatientAssignedFunnel) => {
    const funnelId = funnel.funnelId;
    if (funnelId === undefined || funnelId === null || funnelId === "") return;
    if (dashboardStartingFunnelId !== null) return;
    setDashboardStartingFunnelId(funnelId);
    setLocation(`/form/${encodeURIComponent(String(funnelId))}`);
  };

  // Single-funnel presentation derives from the first assigned funnel; the grid
  // (2+ funnels) renders every funnel independently.
  const primaryFunnel = funnels[0];
  const selectedFunnelForms = primaryFunnel?.forms ?? [];
  const selectedFunnelName = primaryFunnel?.funnelName ?? "Pre-visit Tasks";
  const selectedFunnelId: string | number | null = primaryFunnel ? primaryFunnel.funnelId : null;
  const hasNoFunnels = funnelsReady && !funnelsErrorMsg && funnels.length === 0;
  const isMultiFunnel = funnels.length > 1;

  const completedFormsCount = selectedFunnelForms.filter((form) => isFormCompleted(form)).length;
  const totalFormsCount = selectedFunnelForms.length;
  const progressValue = totalFormsCount > 0 ? (completedFormsCount / totalFormsCount) * 100 : 0;
  const firstIncompleteForm = selectedFunnelForms.find((form) => !isFormCompleted(form));
  const ctaForm = firstIncompleteForm || selectedFunnelForms[0];
  const allCompleted = totalFormsCount > 0 && completedFormsCount === totalFormsCount;
  const noneCompleted = completedFormsCount === 0;
  const ctaLabel = totalFormsCount === 0 ? "Start Form" : allCompleted ? "Form Completed" : noneCompleted ? "Start Form" : "Resume Form";
  const isUpcomingVisitCardLoading = isUpcomingAppointmentLoading || isFunnelFormsLoading;

  const visitsSubtext = isUpcomingAppointmentLoading
    ? "Loading…"
    : nearestUpcomingAppointment
      ? `Next: ${formatShortDate(nearestUpcomingAppointment.attend_date)}`
      : "No upcoming visits";

  // Accurate pending total across every assigned funnel (equals the single
  // funnel's pending count when only one funnel is assigned).
  const pendingFormsCount = sumPendingForms(funnels);
  const formsSubtext = isFunnelFormsLoading
    ? "Loading…"
    : pendingFormsCount > 0
      ? `${pendingFormsCount} pending form${pendingFormsCount === 1 ? "" : "s"}`
      : "No pending forms";

  if (isDashboardInitializing) {
    return <PageLoader />;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Good morning, {user?.name || "Patient"}</h1>
          <p className="text-gray-500 mt-1">Here's what's happening with your health today.</p>
        </div>
        {/* HIDDEN: Schedule Appointment button hidden per UI requirements
        <Button className="bg-red-700 hover:bg-red-800 text-white gap-2">
          <Calendar className="w-4 h-4" />
          Schedule Appointment
        </Button>
        */}
      </div>


      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* <QuickStat 
          icon={CreditCard} 
          label="Pay Bill" 
          subtext="Balance: $45.00" 
          color="text-blue-500" 
          bg="bg-blue-50" 
        />
        <QuickStat 
          icon={MessageSquare} 
          label="Messages" 
          subtext="2 unread from Dr. Smith" 
          color="text-green-500" 
          bg="bg-green-50" 
        /> */}
        <QuickStat
          icon={Calendar}
          label="Visits"
          subtext={visitsSubtext}
          color="text-purple-500"
          bg="bg-purple-50"
          onClick={() => setLocation("/appointments")}
        />
        <QuickStat
          icon={FileText}
          label="Forms"
          subtext={formsSubtext}
          color="text-orange-500"
          bg="bg-orange-50" 
          onClick={() => setLocation("/documents")}
        />
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Main Content Column (full width) */}
        <div className="space-y-6">
          
          {/* Upcoming Visit Card */}
          <Card className="border-l-4 border-l-red-700 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs font-medium">
                Upcoming Visit
              </span>
              <Button variant="ghost" className="text-sm text-gray-500" onClick={() => setLocation("/appointments")}>View Details &gt;</Button>
            </CardHeader>
            <CardContent>
              {isUpcomingVisitCardLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-red-700" />
                </div>
              ) : (
                <>
                  {hasNoUpcomingAppointments ? (
                    <div className="mb-8 py-5">
                      <p className="text-xl font-bold text-gray-900">No upcoming appointments.</p>
                      <p className="text-gray-500 mt-1">Schedule a visit to get started.</p>
                    </div>
                  ) : nearestUpcomingAppointment ? (
                    <>
                      <h2 className="text-xl font-bold text-gray-900">
                        {`${nearestUpcomingAppointment.service_full_name} ${nearestUpcomingAppointment.attend_type_full_name}`}
                      </h2>
                      <p className="text-gray-500 mb-6">With {nearestUpcomingAppointment.provider_name}</p>
                      
                      <div className="flex flex-col md:flex-row gap-6 mb-8">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gray-100 rounded-lg">
                            <Calendar className="w-5 h-5 text-gray-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {formatDashboardDate(nearestUpcomingAppointment.attend_date)}
                            </p>
                            <p className="text-sm text-gray-500">
                              {`${formatDashboardTime(nearestUpcomingAppointment.time)} - ${formatDashboardTime(nearestUpcomingAppointment.end_time)}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gray-100 rounded-lg">
                            <MapPin className="w-5 h-5 text-gray-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{nearestUpcomingAppointment.department}</p>
                            <p className="text-sm text-gray-500"></p>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {funnelsErrorMsg ? (
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between gap-4">
                      <span className="text-sm text-gray-600">{funnelsErrorMsg}</span>
                      <Button variant="outline" size="sm" className="shrink-0" onClick={() => loadDashboardFunnels()}>
                        Retry
                      </Button>
                    </div>
                  ) : hasNoFunnels ? (
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <div className="text-sm font-medium text-gray-700">No forms are currently assigned to this case.</div>
                    </div>
                  ) : isMultiFunnel ? null : (
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <>
                        <div className="flex items-center justify-between gap-4 mb-4">
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="font-medium text-gray-700">{selectedFunnelName}</div>
                            <div className="flex items-center gap-3">
                              <Progress value={progressValue} className="h-2 flex-1 bg-gray-200" indicatorClassName="bg-red-700" />
                              <span className="text-sm text-gray-500 whitespace-nowrap">{completedFormsCount} of {totalFormsCount} completed</span>
                            </div>
                          </div>
                          <Button
                            className="bg-red-700 hover:bg-red-800 text-white shrink-0"
                            disabled={allCompleted || !ctaForm || selectedFunnelId === null || selectedFunnelId === ""}
                            onClick={() => {
                              if (selectedFunnelId !== null && selectedFunnelId !== "") {
                                setLocation(`/form/${encodeURIComponent(String(selectedFunnelId))}`);
                              }
                            }}
                          >
                            {ctaLabel}
                          </Button>
                        </div>
                        <div className={`space-y-3 ${selectedFunnelForms.length > 3 ? "max-h-[132px] overflow-y-auto pr-1 upcoming-visit-forms-scrollbar" : ""}`}>
                          {selectedFunnelForms.length === 0 ? (
                            <div className="flex items-center gap-3 text-sm">
                              <div className="w-5 h-5 rounded-full border-2 border-gray-300"></div>
                              <span className="text-gray-900 font-medium">No forms available</span>
                            </div>
                          ) : (
                            selectedFunnelForms.map((form, index) => {
                              const completed = isFormCompleted(form);
                              const formKey = form?.id ?? form?.form_id ?? getFormName(form);
                              return (
                                <div key={getFormId(form) || index} className="flex items-center justify-between text-sm">
                                  <div className="flex items-center gap-3">
                                    {completed ? (
                                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                                    ) : (
                                      <div className="w-5 h-5 rounded-full border-2 border-gray-300"></div>
                                    )}
                                    <span className={completed ? "text-gray-600 line-through" : "text-gray-900 font-medium"}>{getFormName(form)}</span>
                                  </div>
                                  {completed && (
                                    <div className="flex items-center gap-1 shrink-0">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={funnelFormViewLoadingId === formKey}
                                        onClick={() => handleViewFunnelForm(form)}
                                      >
                                        {funnelFormViewLoadingId === formKey ? (
                                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        ) : (
                                          <Eye className="h-4 w-4 text-muted-foreground" />
                                        )}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={funnelFormDownloadLoadingId === formKey}
                                        onClick={() => handleDownloadFunnelFormPDF(form)}
                                      >
                                        {funnelFormDownloadLoadingId === formKey ? (
                                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        ) : (
                                          <Download className="h-4 w-4 text-muted-foreground" />
                                        )}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Assigned funnels grid — shown only when the case has 2+ funnels.
              One funnel keeps the single card inside the Upcoming Visit card above. */}
          {isMultiFunnel && !funnelsErrorMsg && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-4">Your Assigned Forms</h2>
              <PatientFunnelAccordion
                variant="dashboard"
                funnels={funnels}
                startingFunnelId={dashboardStartingFunnelId}
                onStart={handleStartFunnel}
                onViewForm={handleViewFunnelForm}
                onDownloadForm={handleDownloadFunnelFormPDF}
                viewLoadingId={funnelFormViewLoadingId}
                downloadLoadingId={funnelFormDownloadLoadingId}
              />
            </div>
          )}

          {/* Recent Activity */}
          <RecentActivity />
        </div>

      </div>

      <FormViewModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedForm={selectedForm}
        showNoteSection={true}
      />
    </div>
  );
}

function QuickStat({ icon: Icon, label, subtext, color, bg, onClick }: any) {
  return (
    <div
      className={`bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-start gap-4 hover:shadow-md transition-shadow ${onClick ? "cursor-pointer" : "cursor-default"}`}
      onClick={onClick}
    >
      <div className={`p-3 rounded-lg ${bg} ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="font-bold text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-1">{subtext}</p>
      </div>
    </div>
  );
}

function VitalRow({ label, value, color }: any) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${color}`}></div>
        <span className="text-gray-600 font-medium">{label}</span>
      </div>
      <span className="font-bold text-gray-900">{value}</span>
    </div>
  );
}

function QuickActionBtn({ icon: Icon, label }: any) {
  return (
    <button className="flex flex-col items-center justify-center p-4 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors gap-2">
      <Icon className="w-5 h-5 text-red-700" />
      <span className="text-xs font-medium text-gray-700 text-center">{label}</span>
    </button>
  );
}
