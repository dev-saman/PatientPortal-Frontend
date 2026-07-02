import { useEffect, useState } from "react";
import {
  Calendar,
  CreditCard,
  MessageSquare,
  FileText,
  ChevronRight,
  Clock,
  MapPin,
  Activity,
  AlertCircle,
  CheckCircle2,
  Eye,
  Download,
  Loader2,
  PenTool,
} from "lucide-react";
import PageLoader from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import Apis from "@/lib/Apis";
import { getApiErrorMessage } from "@/lib/apiError";
import FormViewModal from "@/components/FormViewModal";

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

interface PatientFunnel {
  id?: string | number;
  funnel_id?: string | number;
  funnel_name?: string;
  name?: string;
  title?: string;
  [key: string]: any;
}

interface FunnelSubmissionForm {
  id?: string | number;
  form_id?: string | number;
  form_title?: string;
  form_name?: string;
  title?: string;
  name?: string;
  submission_status?: string;
  [key: string]: any;
}

const formatDashboardDate = (dateString: string): string => {
  if (!dateString) return "Monday, October 14";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  } catch {
    return "Monday, October 14";
  }
};

const formatDashboardTime = (timeString: string): string => {
  if (!timeString) return "";
  try {
    const [hours, minutes] = timeString.split(":").map(Number);
    const date = new Date(2000, 0, 1, hours, minutes);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return timeString;
  }
};

const getAppointmentDateTime = (appointment: Appointment): number => {
  if (!appointment.attend_date) return Number.MAX_SAFE_INTEGER;

  const date = new Date(appointment.attend_date);
  if (Number.isNaN(date.getTime())) return Number.MAX_SAFE_INTEGER;

  const timeParts = appointment.time ? appointment.time.split(":").map(Number) : [];
  const hours = Number.isFinite(timeParts[0]) ? timeParts[0] : 0;
  const minutes = Number.isFinite(timeParts[1]) ? timeParts[1] : 0;

  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
};

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [nearestUpcomingAppointment, setNearestUpcomingAppointment] = useState<Appointment | null>(null);

  // Funnel forms state
  const [patientFunnels, setPatientFunnels] = useState<PatientFunnel[]>([]);
  const [isFunnelsLoading, setIsFunnelsLoading] = useState(false);
  const [funnelsError, setFunnelsError] = useState<string | null>(null);
  const [selectedFunnelForms, setSelectedFunnelForms] = useState<FunnelSubmissionForm[]>([]);
  const [selectedFunnelFormsError, setSelectedFunnelFormsError] = useState<string | null>(null);
  const [isSelectedFunnelFormsLoading, setIsSelectedFunnelFormsLoading] = useState(false);
  // Single page-level loading gate — starts true so the loader shows immediately
  // on mount (same pattern as every other page), and only drops to false once
  // the full funnel → funnel-forms chain has resolved.
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [selectedForm, setSelectedForm] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [funnelFormViewLoadingId, setFunnelFormViewLoadingId] = useState<string | number | null>(null);
  const [funnelFormDownloadLoadingId, setFunnelFormDownloadLoadingId] = useState<string | number | null>(null);
  const [editingFunnelId, setEditingFunnelId] = useState<string | number | null>(null);

  // Helpers
  const getFunnelName = (funnel: PatientFunnel): string =>
    funnel.funnel_name || funnel.name || funnel.title || "Untitled Funnel";

  const getFunnelId = (funnel: PatientFunnel): string | number | undefined =>
    funnel.id ?? funnel.funnel_id;

  const getFormName = (form: FunnelSubmissionForm): string =>
    form.form_title || form.form_name || form.title || form.name || "Untitled Form";

  const isFormCompleted = (form: FunnelSubmissionForm): boolean =>
    form.submission_status === "completed";

  const normalizeClinicalDocuments = (response: any): any[] => {
    const responseCandidates = [
      response?.data?.data,
      response?.data,
      response?.forms,
      response?.documents,
      response,
    ];
    const rootList = responseCandidates.find((c) => Array.isArray(c));
    if (!Array.isArray(rootList)) return [];

    const normalized: any[] = [];
    rootList.forEach((item: any) => {
      const formsCandidates = [item?.cases?.forms, item?.forms];
      const forms = formsCandidates.find((c) => Array.isArray(c));
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
    const headerBytes = new Uint8Array(header);
    const isPdf = headerBytes[0] === 0x25 && headerBytes[1] === 0x50 && headerBytes[2] === 0x44 && headerBytes[3] === 0x46;
    if (isPdf) return new Blob([responseBlob], { type: "application/pdf" });
    const isZip = headerBytes[0] === 0x50 && headerBytes[1] === 0x4B;
    if (isZip) {
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

  const handleViewFunnelForm = async (form: FunnelSubmissionForm) => {
    const formName = getFormName(form);
    const formKey = form.id ?? form.form_id ?? formName;
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

  const handleDownloadFunnelFormPDF = async (form: FunnelSubmissionForm) => {
    const formName = getFormName(form);
    const formKey = form.id ?? form.form_id ?? formName;
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
      const sanitizedFormName = formName.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
      const downloadFileName = sanitizedFormName ? `${sanitizedFormName}.pdf` : "patient-form.pdf";
      const pdfObjectUrl = window.URL.createObjectURL(pdfBlob);
      const downloadLink = document.createElement("a");
      downloadLink.href = pdfObjectUrl;
      downloadLink.download = downloadFileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.URL.revokeObjectURL(pdfObjectUrl);
      toast.success("Download successful", { style: { background: "#16a34a", color: "#fff", border: "none" } });
    } catch (err) {
      const msg = getApiErrorMessage(err);
      toast.error(msg || "Failed to download PDF", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
    } finally {
      setFunnelFormDownloadLoadingId(null);
    }
  };

  useEffect(() => {
    const fetchUpcomingAppointment = async () => {
      try {
        const data = await Apis.getPatientAppointments();

        if (!data.success) return;

        const upcoming = [...(data.upcoming_appointments || [])].sort(
          (a, b) => getAppointmentDateTime(a) - getAppointmentDateTime(b)
        );

        setNearestUpcomingAppointment(upcoming[0] || null);
      } catch (error) {
        console.error("Error fetching dashboard appointment:", error);
      }
    };

    fetchUpcomingAppointment();
  }, []);

  useEffect(() => {
    const fetchPatientFunnels = async () => {
      try {
        setIsFunnelsLoading(true);
        const response = await Apis.getPatientFunnels();
        if (response?.success === false) {
          throw new Error(response?.message || response?.error || "");
        }
        const funnelCandidates = [
          response,
          response?.data,
          response?.data?.data,
          response?.funnels,
          response?.funnel,
          response?.patient_funnels,
          response?.data?.funnels,
          response?.data?.funnel,
          response?.data?.patient_funnels,
          response?.data?.data?.funnels,
          response?.data?.data?.funnel,
          response?.data?.data?.patient_funnels,
        ];
        const funnelList = funnelCandidates.find((c) => Array.isArray(c));
        setPatientFunnels(Array.isArray(funnelList) ? funnelList : []);
        setFunnelsError(null);
      } catch (err) {
        setFunnelsError(getApiErrorMessage(err) || null);
        // No funnels — the second effect won't fire, so clear the page loader here.
        setPatientFunnels([]);
        setIsPageLoading(false);
      } finally {
        setIsFunnelsLoading(false);
      }
    };
    fetchPatientFunnels();
  }, []);

  useEffect(() => {
    const selectedFunnel = patientFunnels[0];
    const funnelId = selectedFunnel ? getFunnelId(selectedFunnel) : undefined;
    if (funnelId === undefined || funnelId === null || funnelId === "") {
      setSelectedFunnelForms([]);
      setSelectedFunnelFormsError(null);
      // Funnels loaded but none had an id — data sequence is complete.
      setIsPageLoading(false);
      return;
    }
    const fetchSelectedFunnelForms = async () => {
      try {
        setIsSelectedFunnelFormsLoading(true);
        const response = await Apis.getPatientFunnelSubmissionDetails(funnelId);
        const formCandidates = [
          response?.data?.data?.forms,
          response?.data?.forms,
          response?.forms,
          response?.data?.data,
          response?.data,
          response,
        ];
        const forms = formCandidates.find((c) => Array.isArray(c));
        setSelectedFunnelForms(Array.isArray(forms) ? forms : []);
        setSelectedFunnelFormsError(null);
      } catch (err) {
        setSelectedFunnelForms([]);
        setSelectedFunnelFormsError(getApiErrorMessage(err) || null);
      } finally {
        setIsSelectedFunnelFormsLoading(false);
        // Both funnels AND funnel-forms have now resolved — page is ready.
        setIsPageLoading(false);
      }
    };
    fetchSelectedFunnelForms();
  }, [patientFunnels]);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  // Page-level loader — isPageLoading starts true so the spinner is shown
  // immediately on mount with no flash of page content, matching the
  // behaviour of every other page in the application.
  if (isPageLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {greeting()}, Sarah
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's what's happening with your health today.
          </p>
        </div>
        {/* HIDDEN: Schedule Appointment button hidden per UI requirements
        <div className="flex items-center gap-3">
          <Button
            className="shadow-sm bg-primary hover:bg-primary/90 text-white rounded-full px-6"
            onClick={() => setLocation("/appointments")}
          >
            <Calendar className="mr-2 h-4 w-4" />
            Schedule Appointment
          </Button>
        </div>
        */}
      </div>

      {/* Top Tasks Module - High ROI UX */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/billing">
          <a className="group relative overflow-hidden rounded-xl bg-card p-4 border border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <CreditCard className="h-16 w-16 text-primary" />
            </div>
            <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <CreditCard className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-foreground">Pay Bill</h3>
            <p className="text-xs text-muted-foreground mt-1">Balance: $45.00</p>
          </a>
        </Link>

        <Link href="/messages">
          <a className="group relative overflow-hidden rounded-xl bg-card p-4 border border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <MessageSquare className="h-16 w-16 text-primary" />
            </div>
            <div className="h-10 w-10 rounded-full bg-green-50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <MessageSquare className="h-5 w-5 text-green-600" />
            </div>
            <h3 className="font-semibold text-foreground">Messages</h3>
            <p className="text-xs text-muted-foreground mt-1">2 unread from Dr. Smith</p>
          </a>
        </Link>

        <Link href="/appointments">
          <a className="group relative overflow-hidden rounded-xl bg-card p-4 border border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <Calendar className="h-16 w-16 text-primary" />
            </div>
            <div className="h-10 w-10 rounded-full bg-purple-50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Calendar className="h-5 w-5 text-purple-600" />
            </div>
            <h3 className="font-semibold text-foreground">Visits</h3>
            <p className="text-xs text-muted-foreground mt-1">Next: Oct 14</p>
          </a>
        </Link>

        <Link href="/documents">
          <a className="group relative overflow-hidden rounded-xl bg-card p-4 border border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <FileText className="h-16 w-16 text-primary" />
            </div>
            <div className="h-10 w-10 rounded-full bg-orange-50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <FileText className="h-5 w-5 text-orange-600" />
            </div>
            <h3 className="font-semibold text-foreground">Forms</h3>
            <p className="text-xs text-muted-foreground mt-1">1 pending signature</p>
          </a>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Column — expanded to full width after sidebar hidden */}
        <div className="lg:col-span-3 space-y-8">
          
          {/* Upcoming Appointment Card */}
          <Card className="border-l-4 border-l-primary shadow-soft overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 px-3 py-1">
                  Upcoming Visit
                </Badge>
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setLocation("/appointments")}>
                  View Details <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
              <CardTitle className="text-xl mt-2">
                {nearestUpcomingAppointment
                  ? `${nearestUpcomingAppointment.service_full_name} ${nearestUpcomingAppointment.attend_type_full_name}`
                  : "Neurology Follow-up"}
              </CardTitle>
              <CardDescription>With {nearestUpcomingAppointment?.provider_name || "Dr. Emily Chen"}</CardDescription>
            </CardHeader>
            <CardContent className="pb-6">
              <div className="flex flex-col sm:flex-row gap-6 mt-2">
                <div className="flex items-start gap-3">
                  <div className="bg-secondary p-2 rounded-lg">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {nearestUpcomingAppointment ? formatDashboardDate(nearestUpcomingAppointment.attend_date) : "Monday, October 14"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {nearestUpcomingAppointment
                        ? `${formatDashboardTime(nearestUpcomingAppointment.time)} - ${formatDashboardTime(nearestUpcomingAppointment.end_time)}`
                        : "10:30 AM"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-secondary p-2 rounded-lg">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{nearestUpcomingAppointment?.department || "Main Clinic - Suite 300"}</p>
                    <p className="text-sm text-muted-foreground">{nearestUpcomingAppointment ? "" : "123 Healthcare Blvd"}</p>
                  </div>
                </div>
              </div>

              {/* Funnel Forms Listing */}
              {(() => {
                const selectedFunnel = patientFunnels[0];
                const selectedFunnelName = selectedFunnel ? getFunnelName(selectedFunnel) : "";
                const funnelStartId = selectedFunnel ? getFunnelId(selectedFunnel) : undefined;
                const hasFunnelStartId = funnelStartId !== undefined && funnelStartId !== null && funnelStartId !== "";
                const pendingCount = selectedFunnelForms.filter((form) => !isFormCompleted(form)).length;
                const totalFormsCount = selectedFunnelForms.length;
                const completedFormsCount = totalFormsCount - pendingCount;
                const funnelProgressValue = totalFormsCount > 0 ? (completedFormsCount / totalFormsCount) * 100 : 0;
                const allFormsCompleted = totalFormsCount > 0 && pendingCount === 0;
                const noneCompleted = pendingCount === totalFormsCount;
                const funnelCtaLabel = totalFormsCount === 0 ? "Start Form" : allFormsCompleted ? "Form Completed" : noneCompleted ? "Start Form" : "Resume Form";
                const isStartingFunnel = editingFunnelId !== null && funnelStartId !== undefined && editingFunnelId === funnelStartId;
                const canShowFunnel = !funnelsError && !isFunnelsLoading && patientFunnels.length > 0;

                if (!canShowFunnel) return null;

                return (
                  <div className="mt-6 bg-secondary/30 rounded-xl p-4 border border-border/50">
                    <div className="flex items-center justify-between gap-4 mb-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        <span className="text-sm font-semibold">{selectedFunnelName}</span>
                        <div className="flex items-center gap-3">
                          <Progress value={funnelProgressValue} className="h-2 flex-1 bg-secondary" indicatorClassName="bg-primary" />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{completedFormsCount} of {totalFormsCount} completed</span>
                        </div>
                      </div>
                      <Button
                        className="bg-primary hover:bg-primary/90 shrink-0"
                        size="sm"
                        disabled={allFormsCompleted || isStartingFunnel || !hasFunnelStartId}
                        onClick={() => {
                          if (!hasFunnelStartId) return;
                          setEditingFunnelId(funnelStartId!);
                          setLocation(`/form/${encodeURIComponent(String(funnelStartId))}`);
                        }}
                      >
                        {isStartingFunnel ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {funnelCtaLabel}
                      </Button>
                    </div>

                    <div className="space-y-2 max-h-[300px] overflow-y-auto scroll-smooth pr-1">
                      {funnelsError ? (
                        <div className="p-3 text-sm text-muted-foreground">{funnelsError}</div>
                      ) : isSelectedFunnelFormsLoading ? (
                        <div className="p-3 text-sm text-muted-foreground">Loading forms...</div>
                      ) : selectedFunnelFormsError ? (
                        <div className="p-3 text-sm text-muted-foreground">{selectedFunnelFormsError}</div>
                      ) : selectedFunnelForms.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">No forms available</div>
                      ) : (
                        selectedFunnelForms.map((form, idx) => {
                          const completed = isFormCompleted(form);
                          const formKey = form.id ?? form.form_id ?? getFormName(form);
                          return (
                            <div
                              key={form.id || form.form_id || idx}
                              className={`flex items-center justify-between gap-3 p-3 bg-background rounded-lg border border-border ${completed ? "opacity-75" : ""}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`p-1.5 rounded-md ${completed ? "bg-green-100" : "bg-yellow-100"}`}>
                                  {completed ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-700" />
                                  ) : (
                                    <PenTool className="h-4 w-4 text-yellow-700" />
                                  )}
                                </div>
                                <span className={`text-sm font-medium ${completed ? "line-through text-muted-foreground" : ""}`}>
                                  {getFormName(form)}
                                </span>
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
                  </div>
                );
              })()}
            </CardContent>
            <CardFooter className="bg-secondary/20 border-t border-border p-4 flex gap-3">
              <Button className="flex-1 bg-primary hover:bg-primary/90">
                eCheck-In
              </Button>
              <Button variant="outline" className="flex-1 bg-background" onClick={() => setLocation("/appointments")}>
                Reschedule
              </Button>
            </CardFooter>
          </Card>

          {/* Recent Activity Feed */}
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Recent Activity
            </h2>
            <div className="space-y-4">
              {[
                {
                  icon: FileText,
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                  title: "Lab Results Available",
                  desc: "Complete Blood Count (CBC) from Oct 01",
                  time: "2 days ago",
                  action: "View Results",
                  link: "/health"
                },
                {
                  icon: MessageSquare,
                  color: "text-green-600",
                  bg: "bg-green-50",
                  title: "New Message",
                  desc: "From Dr. Smith regarding prescription refill",
                  time: "3 days ago",
                  action: "Read Message",
                  link: "/messages"
                },
                {
                  icon: CreditCard,
                  color: "text-purple-600",
                  bg: "bg-purple-50",
                  title: "Payment Processed",
                  desc: "Receipt #4921 for $25.00 copay",
                  time: "1 week ago",
                  action: "View Receipt",
                  link: "/billing"
                }
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-all">
                  <div className={`p-2 rounded-lg ${item.bg}`}>
                    <item.icon className={`h-5 w-5 ${item.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-sm">{item.title}</h3>
                      <span className="text-xs text-muted-foreground">{item.time}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
                    <Button 
                      variant="link" 
                      className="h-auto p-0 mt-2 text-xs text-primary"
                      onClick={() => setLocation(item.link)}
                    >
                      {item.action}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* HIDDEN: Sidebar column (Health Snapshot, Quick Actions, Proxy Access Banner) hidden per UI requirements
        <div className="space-y-6">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">Health Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">Blood Pressure</span>
                </div>
                <span className="text-sm font-bold">120/80</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-yellow-500" />
                  <span className="text-sm font-medium">Weight</span>
                </div>
                <span className="text-sm font-bold">165 lbs</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-sm font-medium">Heart Rate</span>
                </div>
                <span className="text-sm font-bold">72 bpm</span>
              </div>
              <Button variant="outline" className="w-full text-xs" onClick={() => setLocation("/health")}>
                View All Vitals
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-auto py-3 flex flex-col gap-2 bg-background hover:bg-secondary/50" onClick={() => setLocation("/messages")}>
                <Clock className="h-5 w-5 text-primary" />
                <span className="text-xs">Refill Rx</span>
              </Button>
              <Button variant="outline" className="h-auto py-3 flex flex-col gap-2 bg-background hover:bg-secondary/50">
                <MapPin className="h-5 w-5 text-primary" />
                <span className="text-xs">Find Location</span>
              </Button>
              <Button variant="outline" className="h-auto py-3 flex flex-col gap-2 bg-background hover:bg-secondary/50" onClick={() => setLocation("/messages")}>
                <AlertCircle className="h-5 w-5 text-primary" />
                <span className="text-xs">Symptom Checker</span>
              </Button>
              <Button variant="outline" className="h-auto py-3 flex flex-col gap-2 bg-background hover:bg-secondary/50" onClick={() => setLocation("/health")}>
                <FileText className="h-5 w-5 text-primary" />
                <span className="text-xs">Records</span>
              </Button>
            </CardContent>
          </Card>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <h4 className="font-semibold text-blue-900 text-sm mb-1">Managing Care?</h4>
            <p className="text-xs text-blue-700 mb-3">
              Request proxy access to manage health records for a child or dependent adult.
            </p>
            <Button size="sm" variant="outline" className="w-full bg-white text-blue-700 border-blue-200 hover:bg-blue-50" onClick={() => setLocation("/profile")}>
              Manage Access
            </Button>
          </div>
        </div>
        */}
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
