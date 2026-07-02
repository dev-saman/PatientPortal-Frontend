import {
  FileText,
  Upload,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  PenTool,
  Loader2,
  Star,
  X,
  ArrowUpDown
} from "lucide-react";
import FormViewModal from "@/components/FormViewModal";
import PageLoader from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import Apis from "@/lib/Apis";
import { getApiErrorMessage } from "@/lib/apiError";
import { getActiveCaseId } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination";


interface ClinicalNote {
  id?: string | number;
  note_id?: string | number;
  amd_note_id?: string | number;
  title?: string;
  note_title?: string;
  name?: string;
  template_name?: string;
  content?: string;
  note?: string;
  description?: string;
  created_at?: string;
  date?: string;
  service_date?: string;
  case_id?: string | number;
  view_pdf_url?: string;
  download_pdf_url?: string;
  [key: string]: any;
}

interface FormField {
  type: string;
  required?: boolean;
  label?: string;
  className?: string;
  name?: string;
  subtype?: string;
  column?: string;
  is_client_email?: boolean;
  value?: string | null;
  placeholder?: string;
  inline?: boolean;
  [key: string]: any;
}

interface SubmittedForm {
  id?: string | number;
  form_title: string;
  created_at: string;
  funnel_name: string;
  downloadPdf?: string;
  pdf_url?: string;
  json?: FormField[] | Record<string, FormField>;
  decoded_json?: FormField[] | Record<string, FormField>;
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

const staticClinicalDocuments = [
  {
    id: "clinical-1",
    formTitle: "Personal Injury Insurance Information Worksheet (Spanish)",
    subText: "May 22, 2026 • Auto/PI NPPW (Spanish)",
  },
  {
    id: "clinical-2",
    formTitle: "Patient Intro Form (Spanish)",
    subText: "May 22, 2026 • Auto/PI NPPW (Spanish)",
  },
];

const staticAdministrativeDocuments = [
  {
    id: "admin-1",
    formTitle: "Patient Intro Form",
    subText: "Apr 9, 2026 • WC/DOL NPPW",
  },
  {
    id: "admin-2",
    formTitle: "Employer Information",
    subText: "Apr 9, 2026 • WC/DOL NPPW",
  },
];

export default function Documents() {
  type DocumentTabType = "clinical" | "admin";
  const [oldFormsData, setOldFormsData] = useState<SubmittedForm[]>([]);
  const [patientFunnels, setPatientFunnels] = useState<PatientFunnel[]>([]);
  const [isFunnelsLoading, setIsFunnelsLoading] = useState(false);
  const [funnelsError, setFunnelsError] = useState<string | null>(null);
  const [selectedFunnelForms, setSelectedFunnelForms] = useState<FunnelSubmissionForm[]>([]);
  const [selectedFunnelFormsError, setSelectedFunnelFormsError] = useState<string | null>(null);
  const [isSelectedFunnelFormsLoading, setIsSelectedFunnelFormsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedForm, setSelectedForm] = useState<SubmittedForm | null>(null);
  const [clinicalDocuments, setClinicalDocuments] = useState<any[]>([]);
  const [isClinicalLoading, setIsClinicalLoading] = useState(true);
  const [clinicalError, setClinicalError] = useState<string | null>(null);
  const [clinicalNotes, setClinicalNotes] = useState<ClinicalNote[]>([]);
  const [fileNotes, setFileNotes] = useState<any[]>([]);
  const [isClinicalNotesLoading, setIsClinicalNotesLoading] = useState(false);
  const [clinicalNotesError, setClinicalNotesError] = useState<string | null>(null);
  const [selectedNewFormIndexes, setSelectedNewFormIndexes] = useState<number[]>([]);
  const [selectedOldFormIndexes, setSelectedOldFormIndexes] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState("bulk-action");
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [activeDocumentsTab, setActiveDocumentsTab] = useState("clinical");
  const [viewedFormTab, setViewedFormTab] = useState<DocumentTabType>("clinical");
  const [editingFunnelId, setEditingFunnelId] = useState<string | number | null>(null);
  const [funnelFormViewLoadingId, setFunnelFormViewLoadingId] = useState<string | number | null>(null);
  const [funnelFormDownloadLoadingId, setFunnelFormDownloadLoadingId] = useState<string | number | null>(null);
  const [completedFunnels, setCompletedFunnels] = useState<Record<string, boolean>>({});
  const [isCompletionCheckLoading, setIsCompletionCheckLoading] = useState(false);
  const [clinicalPage, setClinicalPage] = useState(1);
  const [adminPage, setAdminPage] = useState(1);
  const [clinicalSortOrder, setClinicalSortOrder] = useState<'asc' | 'desc' | null>(null);
  const [adminSortOrder, setAdminSortOrder] = useState<'asc' | 'desc' | null>(null);
  const [clinicalNoteViewLoadingId, setClinicalNoteViewLoadingId] = useState<string | number | null>(null);
  const [clinicalNoteDownloadLoadingId, setClinicalNoteDownloadLoadingId] = useState<string | number | null>(null);
  const [fileNoteViewLoadingId, setFileNoteViewLoadingId] = useState<string | number | null>(null);
  const [fileNoteDownloadLoadingId, setFileNoteDownloadLoadingId] = useState<string | number | null>(null);
  const [adminNotes, setAdminNotes] = useState<any[]>([]);
  const [isAdminNotesLoading, setIsAdminNotesLoading] = useState(false);
  const [adminNotesError, setAdminNotesError] = useState<string | null>(null);
  const [adminNoteViewLoadingId, setAdminNoteViewLoadingId] = useState<string | number | null>(null);
  const [adminNoteDownloadLoadingId, setAdminNoteDownloadLoadingId] = useState<string | number | null>(null);
  const [, setLocation] = useLocation();

  // Normalize legacy and case-based clinical API responses into a flat form list
  const normalizeClinicalDocuments = (response: any): any[] => {
    const responseCandidates = [
      response?.data?.data,
      response?.data,
      response?.forms,
      response?.documents,
      response,
    ];
    const rootList = responseCandidates.find((candidate) => Array.isArray(candidate));
    if (!Array.isArray(rootList)) {
      return [];
    }

    const normalized: any[] = [];

    rootList.forEach((item: any) => {
      const formsCandidates = [
        item?.cases?.forms,
        item?.forms,
      ];
      const forms = formsCandidates.find((candidate) => Array.isArray(candidate));

      // Backward compatibility: list is already a flat list of forms
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

      if (!Array.isArray(forms)) {
        return;
      }

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

  // NOTE: The "Clinical Documents" and "Administrative" tabs currently render
  // static placeholder tables (staticClinicalDocuments / staticAdministrativeDocuments),
  // so the get-patient-form-data and get-patient-submited-form-data calls were removed
  // to avoid fetching data that is never displayed. Re-add them here (gated on the
  // active tab) if/when those tables are switched back to dynamic data.

  // Fetch patient funnels on component mount
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
        const funnelList = funnelCandidates.find((candidate) => Array.isArray(candidate));

        const funnels = Array.isArray(funnelList) ? funnelList : [];
        setPatientFunnels(funnels);

        // Build completion status map directly from get-patient-funnels response
        const completionMap: Record<string, boolean> = {};
        funnels.forEach((f: any) => {
          const id = f.id ?? f.funnel_id;
          if (id !== undefined && id !== null) {
            completionMap[String(id)] = f.submission_status === "completed";
          }
        });
        setCompletedFunnels(completionMap);

        setFunnelsError(null);
      } catch (err) {
        console.error("Error fetching patient funnels:", err);
        setFunnelsError(getApiErrorMessage(err) || null);
        setPatientFunnels([]);
      } finally {
        setIsFunnelsLoading(false);
      }
    };

    fetchPatientFunnels();
  }, []);

  // Fetch clinical notes on mount; re-runs automatically on case change
  // because Layout remounts the page (via contentRefreshKey) when the active case switches.
  useEffect(() => {
    const fetchClinicalNotes = async () => {
      try {
        setIsClinicalNotesLoading(true);
        const response = await Apis.getClinical();

        const documents = response?.data?.documents ?? response?.documents ?? [];
        setClinicalNotes(Array.isArray(documents) ? documents : []);

        const fileNoteCandidates = [
          response?.data?.data?.file_notes,
          response?.data?.file_notes,
          response?.file_notes,
        ];
        const fileNoteList = fileNoteCandidates.find((candidate) => Array.isArray(candidate));
        setFileNotes(Array.isArray(fileNoteList) ? fileNoteList : []);

        setClinicalNotesError(null);
      } catch (err) {
        const msg = getApiErrorMessage(err) || "Failed to load clinical notes";
        setClinicalNotesError(msg);
        toast.error(msg, { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
        setClinicalNotes([]);
        setFileNotes([]);
      } finally {
        setIsClinicalNotesLoading(false);
      }
    };

    fetchClinicalNotes();
  }, []);

  useEffect(() => {
    const fetchAdminNotes = async () => {
      try {
        setIsAdminNotesLoading(true);
        const response = await Apis.getAdministratorNotes();
        const candidates = [
          response?.data?.files,
          response?.data?.data?.files,
          response?.data?.data,
          response?.data,
          response?.files,
          response?.notes,
          response?.documents,
          response,
        ];
        const list = candidates.find((c) => Array.isArray(c));
        setAdminNotes(Array.isArray(list) ? list : []);
        setAdminNotesError(null);
      } catch (err) {
        const msg = getApiErrorMessage(err) || "Failed to load administrative notes";
        setAdminNotesError(msg);
        setAdminNotes([]);
      } finally {
        setIsAdminNotesLoading(false);
      }
    };
    fetchAdminNotes();
  }, []);

  // Check completion status for a single funnel on-demand
  const checkSingleFunnelCompletion = async (funnelId: string | number): Promise<boolean> => {
    try {
      const response = await Apis.getPatientFunnelSubmissionDetails(funnelId);

      // Extract forms array from response
      const formCandidates = [
        response?.data?.data?.forms,
        response?.data?.forms,
        response?.forms,
        response?.data?.data,
        response?.data,
        response,
      ];
      const forms = formCandidates.find((candidate) => Array.isArray(candidate));

      if (Array.isArray(forms) && forms.length > 0) {
        return forms.every((form: any) => form.submission_status === "completed");
      }
      return false;
    } catch {
      return false;
    }
  };


  const getFunnelName = (funnel: PatientFunnel): string => {
    return funnel.funnel_name || funnel.name || funnel.title || "Untitled Funnel";
  };

  const getFunnelId = (funnel: PatientFunnel): string | number | undefined => {
    return funnel.id ?? funnel.funnel_id;
  };

  const getFunnelSlug = (funnelName: string): string => {
    return funnelName.trim().replace(/\s+/g, "-");
  };

  const getFormName = (form: FunnelSubmissionForm): string => {
    return form.form_title || form.form_name || form.title || form.name || "Untitled Form";
  };

  const isFormCompleted = (form: FunnelSubmissionForm): boolean => {
    return form.submission_status === "completed";
  };

  const handleEditFunnel = async (funnel: PatientFunnel) => {
    const funnelId = getFunnelId(funnel);
    const funnelName = getFunnelName(funnel);

    if (funnelId === undefined || funnelId === null || funnelId === "") {
      alert("Funnel id is not available");
      return;
    }

    try {
      setEditingFunnelId(funnelId);

      // Check completion status from cached get-patient-funnels data
      if (completedFunnels[String(funnelId)] === true) {
        // Funnel is completed, don't navigate
        setEditingFunnelId(null);
        return;
      }

      sessionStorage.setItem(
        `patient_funnel_${funnelId}`,
        JSON.stringify({
          funnelId,
          funnelName,
        })
      );

      setLocation(`/form/${encodeURIComponent(String(funnelId))}`);
    } catch (err) {
      console.error("Error navigating to funnel form:", err);
      alert(getApiErrorMessage(err));
    } finally {
      setEditingFunnelId(null);
    }
  };

  const handleViewFunnelForm = async (form: FunnelSubmissionForm) => {
    const formName = getFormName(form);
    const formKey = form.id ?? form.form_id ?? formName;
    setFunnelFormViewLoadingId(formKey);
    try {
      const response = await Apis.getPatientFormData();
      const normalized = normalizeClinicalDocuments(response);
      const matched = normalized.find(
        (f) => (f.form_title || f.title || f.name || "").toLowerCase() === formName.toLowerCase()
      ) ?? normalized[0];
      if (!matched) {
        alert("Form data not available");
        return;
      }
      setSelectedForm(matched);
      setViewedFormTab("clinical");
      setIsModalOpen(true);
    } catch (err) {
      alert(getApiErrorMessage(err));
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
      const matched = normalized.find(
        (f) => (f.form_title || f.title || f.name || "").toLowerCase() === formName.toLowerCase()
      ) ?? normalized[0];
      if (!matched) {
        toast.error("PDF not available", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
        return;
      }
      const rawPdfUrl = (matched.pdf_url || matched.downloadPdf || "").trim();
      if (!rawPdfUrl) {
        toast.error("PDF not available", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
        return;
      }
      // Extract only the filename from the pdf_url to pass to download-patient-form-pdf
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
    const selectedFunnel = patientFunnels[0];
    const funnelId = selectedFunnel ? getFunnelId(selectedFunnel) : undefined;

    if (funnelId === undefined || funnelId === null || funnelId === "") {
      setSelectedFunnelForms([]);
      setSelectedFunnelFormsError(null);
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
        const forms = formCandidates.find((candidate) => Array.isArray(candidate));
        setSelectedFunnelForms(Array.isArray(forms) ? forms : []);
        setSelectedFunnelFormsError(null);
      } catch (err) {
        console.error("Error fetching selected funnel forms:", err);
        setSelectedFunnelForms([]);
        setSelectedFunnelFormsError(getApiErrorMessage(err) || null);
      } finally {
        setIsSelectedFunnelFormsLoading(false);
      }
    };

    fetchSelectedFunnelForms();
  }, [patientFunnels]);

  // Helper: extract a single PDF from a ZIP blob, or return the blob as-is if it's already a PDF
  const extractPdfFromResponse = async (responseBlob: Blob): Promise<Blob> => {
    // Check the first 4 bytes to determine file type
    const header = await responseBlob.slice(0, 4).arrayBuffer();
    const headerBytes = new Uint8Array(header);

    // PDF magic bytes: %PDF (0x25 0x50 0x44 0x46)
    const isPdf = headerBytes[0] === 0x25 && headerBytes[1] === 0x50 && headerBytes[2] === 0x44 && headerBytes[3] === 0x46;
    if (isPdf) {
      return new Blob([responseBlob], { type: "application/pdf" });
    }

    // ZIP magic bytes: PK (0x50 0x4B)
    const isZip = headerBytes[0] === 0x50 && headerBytes[1] === 0x4B;
    if (isZip) {
      // Use JSZip to extract the first PDF from the ZIP
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(responseBlob);
      const pdfFiles = Object.keys(zip.files).filter((name) => name.toLowerCase().endsWith(".pdf"));

      if (pdfFiles.length > 0) {
        const pdfData = await zip.files[pdfFiles[0]].async("blob");
        return new Blob([pdfData], { type: "application/pdf" });
      }
    }

    // Fallback: return as-is with PDF MIME type
    return new Blob([responseBlob], { type: "application/pdf" });
  };

  // Handle PDF download (Clinical Documents - New Platform)
  const handleDownloadClinicalPDF = async (pdfUrl?: string, formTitle?: string) => {
    const trimmedPdfUrl = typeof pdfUrl === "string" ? pdfUrl.trim() : "";

    if (!trimmedPdfUrl) {
      alert("PDF is not available");
      return;
    }

    try {
      const responseBlob = await Apis.downloadPatientFormPDF([trimmedPdfUrl]);

      if (!(responseBlob instanceof Blob) || responseBlob.size === 0) {
        throw new Error("The PDF file returned by the server is empty or invalid");
      }

      const pdfBlob = await extractPdfFromResponse(responseBlob);

      const sanitizedFormTitle = formTitle
        ?.trim()
        .replace(/[^a-z0-9-_]+/gi, "-")
        .replace(/^-+|-+$/g, "");
      const pdfFileName = sanitizedFormTitle
        ? `${sanitizedFormTitle}.pdf`
        : "patient-form.pdf";
      const pdfObjectUrl = window.URL.createObjectURL(pdfBlob);
      const downloadLink = document.createElement("a");
      downloadLink.href = pdfObjectUrl;
      downloadLink.download = pdfFileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.URL.revokeObjectURL(pdfObjectUrl);
    } catch (err) {
      console.error("Error downloading clinical form PDF:", err);
      alert(getApiErrorMessage(err));
    }
  };

  // Handle PDF download (Administrative - Old Platform)
  const handleDownloadPDF = async (pdfUrl?: string, formTitle?: string) => {
    const trimmedPdfUrl = typeof pdfUrl === "string" ? pdfUrl.trim() : "";

    if (!trimmedPdfUrl) {
      alert("PDF is not available");
      return;
    }

    try {
      const responseBlob = await Apis.downloadPatientSubmittedFormPDF([trimmedPdfUrl]);

      if (!(responseBlob instanceof Blob) || responseBlob.size === 0) {
        throw new Error("The PDF file returned by the server is empty or invalid");
      }

      const pdfBlob = await extractPdfFromResponse(responseBlob);

      const sanitizedFormTitle = formTitle
        ?.trim()
        .replace(/[^a-z0-9-_]+/gi, "-")
        .replace(/^-+|-+$/g, "");
      const pdfFileName = sanitizedFormTitle
        ? `${sanitizedFormTitle}.pdf`
        : "patient-submitted-form.pdf";
      const pdfObjectUrl = window.URL.createObjectURL(pdfBlob);
      const downloadLink = document.createElement("a");
      downloadLink.href = pdfObjectUrl;
      downloadLink.download = pdfFileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.URL.revokeObjectURL(pdfObjectUrl);
    } catch (err) {
      console.error("Error downloading form PDF:", err);
      alert(getApiErrorMessage(err));
    }
  };


  // Handle eye button click to open modal
  const handleViewForm = (form: SubmittedForm, tab: DocumentTabType) => {
    setSelectedForm(form);
    setViewedFormTab(tab);
    setIsModalOpen(true);
  };

  const handleViewClinicalNote = async (note: ClinicalNote) => {
    const noteId = note.amd_note_id ?? note.note_id ?? note.id ?? null;
    const viewUrl = note.view_pdf_url;
    if (!viewUrl) {
      toast.error("View URL is not available", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
      return;
    }
    setClinicalNoteViewLoadingId(noteId);
    try {
      const blob = await Apis.getClinicalDocumentBlob(viewUrl);
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error("The file returned by the server is empty or invalid");
      }
      const objectUrl = window.URL.createObjectURL(blob);
      const newTab = window.open(objectUrl, "_blank");
      setTimeout(() => window.URL.revokeObjectURL(objectUrl), 10000);
      if (!newTab) {
        toast.error("Popup blocked. Please allow popups for this site.", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
      }
    } catch (err) {
      const msg = getApiErrorMessage(err) || "Failed to load clinical note";
      toast.error(msg, { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
    } finally {
      setClinicalNoteViewLoadingId(null);
    }
  };

  const handleDownloadClinicalNote = async (note: ClinicalNote) => {
    const noteId = note.amd_note_id ?? note.note_id ?? note.id ?? null;
    const downloadUrl = note.download_pdf_url;
    if (!downloadUrl) {
      toast.error("Download URL is not available", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
      return;
    }
    setClinicalNoteDownloadLoadingId(noteId);
    try {
      const blob = await Apis.getClinicalDocumentBlob(downloadUrl);
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error("The file returned by the server is empty or invalid");
      }
      const title = note.template_name || note?.name || note?.note_title || note?.title || "clinical-note";
      const sanitizedTitle = title.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
      const fileName = sanitizedTitle ? `${sanitizedTitle}.pdf` : "clinical-note.pdf";
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
      toast.success("Download successful", { style: { background: "#16a34a", color: "#fff", border: "none" } });
    } catch (err) {
      const msg = getApiErrorMessage(err) || "Failed to download clinical note";
      toast.error(msg, { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
    } finally {
      setClinicalNoteDownloadLoadingId(null);
    }
  };

  // network.ts re-throws `error.response.data` directly (line: throw error.response?.data || error.message).
  // For blob-response requests the response body is stored as a Blob, so `err` in the
  // catch block IS the Blob — not an AxiosError. We read it as text, parse JSON, and
  // return the API message. Also handles the nested case where err.response.data is a Blob.
  const getFileNoteErrorMessage = async (err: unknown, fallback: string): Promise<string> => {
    const blobToRead = err instanceof Blob ? err : (err as any)?.response?.data instanceof Blob ? (err as any).response.data : null;
    if (blobToRead) {
      try {
        const text = await blobToRead.text();
        const parsed = JSON.parse(text);
        const apiMsg = parsed?.message || parsed?.error || "";
        if (apiMsg) return apiMsg;
      } catch {
        // ignore parse errors, fall through
      }
    }
    return getApiErrorMessage(err) || fallback;
  };

  const handleViewFileNote = async (fileNote: any, itemKey: string | number) => {
    setFileNoteViewLoadingId(itemKey);
    try {
      const folder = fileNote?.folder ?? "";
      const subFolder = fileNote?.sub_folder ?? fileNote?.subFolder ?? "";
      const filename = fileNote?.filename ?? fileNote?.file_name ?? fileNote?.name ?? "";
      if (!folder || !subFolder || !filename) {
        toast.error("File information is incomplete", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
        return;
      }
      const blob = await Apis.getClinicalNoteFilePreview(folder, subFolder, filename);
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error("The file returned by the server is empty or invalid");
      }
      const objectUrl = window.URL.createObjectURL(blob);
      const newTab = window.open(objectUrl, "_blank");
      setTimeout(() => window.URL.revokeObjectURL(objectUrl), 10000);
      if (!newTab) {
        toast.error("Popup blocked. Please allow popups for this site.", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
      }
    } catch (err) {
      const msg = await getFileNoteErrorMessage(err, "Failed to load file preview");
      toast.error(msg, { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
    } finally {
      setFileNoteViewLoadingId(null);
    }
  };

  const handleDownloadFileNote = async (fileNote: any, itemKey: string | number) => {
    setFileNoteDownloadLoadingId(itemKey);
    try {
      const folder = fileNote?.folder ?? "";
      const subFolder = fileNote?.sub_folder ?? fileNote?.subFolder ?? "";
      const filename = fileNote?.filename ?? fileNote?.file_name ?? fileNote?.name ?? "";
      if (!folder || !subFolder || !filename) {
        toast.error("File information is incomplete", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
        return;
      }
      const blob = await Apis.getClinicalNoteFilePreview(folder, subFolder, filename);
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error("The file returned by the server is empty or invalid");
      }
      const sanitized = filename.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
      const downloadName = sanitized || "file";
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
      toast.success("Download successful", { style: { background: "#16a34a", color: "#fff", border: "none" } });
    } catch (err) {
      const msg = await getFileNoteErrorMessage(err, "Failed to download file");
      toast.error(msg, { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
    } finally {
      setFileNoteDownloadLoadingId(null);
    }
  };

  const handleViewAdminNote = (note: any, itemKey: string | number) => {
    const url = note?.file_url ?? "";
    if (!url) {
      toast.error("View URL is not available", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
      return;
    }
    const newTab = window.open(url, "_blank");
    if (!newTab) {
      toast.error("Popup blocked. Please allow popups for this site.", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
    }
  };

  const handleDownloadAdminNote = async (note: any, itemKey: string | number) => {
    setAdminNoteDownloadLoadingId(itemKey);
    try {
      const folder = note?.folder ?? "";
      const subFolder = note?.sub_folder ?? note?.subFolder ?? "";
      const filename = note?.filename ?? note?.file_name ?? note?.name ?? "";
      if (!folder || !subFolder || !filename) {
        toast.error("File information is incomplete", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
        return;
      }
      const blob = await Apis.getClinicalNoteFilePreview(folder, subFolder, filename);
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error("The file returned by the server is empty or invalid");
      }
      const sanitized = filename.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
      const downloadName = sanitized || "administrative-note";
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
      toast.success("Download successful", { style: { background: "#16a34a", color: "#fff", border: "none" } });
    } catch (err) {
      const msg = await getFileNoteErrorMessage(err, "Failed to download file");
      toast.error(msg, { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
    } finally {
      setAdminNoteDownloadLoadingId(null);
    }
  };

  const handleNewFormSelectionChange = (index: number, checked: boolean) => {
    setSelectedNewFormIndexes((currentIndexes) => {
      if (checked) {
        return currentIndexes.includes(index) ? currentIndexes : [...currentIndexes, index];
      }

      return currentIndexes.filter((currentIndex) => currentIndex !== index);
    });
  };

  const handleOldFormSelectionChange = (index: number, checked: boolean) => {
    setSelectedOldFormIndexes((currentIndexes) => {
      if (checked) {
        return currentIndexes.includes(index) ? currentIndexes : [...currentIndexes, index];
      }

      return currentIndexes.filter((currentIndex) => currentIndex !== index);
    });
  };

  const ITEMS_PER_PAGE = 10;

  const handleDocumentsTabChange = (nextTab: string) => {
    if (nextTab === activeDocumentsTab) {
      return;
    }

    setSelectedNewFormIndexes([]);
    setSelectedOldFormIndexes([]);
    setBulkAction("bulk-action");
    setClinicalPage(1);
    setAdminPage(1);
    setActiveDocumentsTab(nextTab);
  };

  // Pagination helpers
  const getSortedData = <T extends Record<string, any>>(data: T[], sortOrder: 'asc' | 'desc' | null, nameKey: string = 'form_title'): T[] => {
    if (!sortOrder) return data;
    return [...data].sort((a, b) => {
      const nameA = (a[nameKey] || a.title || a.name || '').toLowerCase();
      const nameB = (b[nameKey] || b.title || b.name || '').toLowerCase();
      if (sortOrder === 'asc') return nameA.localeCompare(nameB);
      return nameB.localeCompare(nameA);
    });
  };

  const getPaginatedData = <T,>(data: T[], page: number): T[] => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return data.slice(start, start + ITEMS_PER_PAGE);
  };

  const getTotalPages = (totalItems: number): number => {
    return Math.ceil(totalItems / ITEMS_PER_PAGE);
  };

  const getPageNumbers = (currentPage: number, totalPages: number): (number | "ellipsis")[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | "ellipsis")[] = [1];
    if (currentPage > 3) pages.push("ellipsis");
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("ellipsis");
    pages.push(totalPages);
    return pages;
  };

  const renderPagination = (currentPage: number, totalItems: number, onPageChange: (page: number) => void) => {
    const totalPages = getTotalPages(totalItems);
    if (totalPages <= 1) return null;
    const pageNumbers = getPageNumbers(currentPage, totalPages);

    return (
      <Pagination className="py-4">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={(e) => { e.preventDefault(); if (currentPage > 1) onPageChange(currentPage - 1); }}
              className={currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
            />
          </PaginationItem>
          {pageNumbers.map((pageNum, idx) =>
            pageNum === "ellipsis" ? (
              <PaginationItem key={`ellipsis-${idx}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={pageNum}>
                <PaginationLink
                  isActive={pageNum === currentPage}
                  onClick={(e) => { e.preventDefault(); onPageChange(pageNum); }}
                  className="cursor-pointer"
                >
                  {pageNum}
                </PaginationLink>
              </PaginationItem>
            )
          )}
          <PaginationItem>
            <PaginationNext
              onClick={(e) => { e.preventDefault(); if (currentPage < totalPages) onPageChange(currentPage + 1); }}
              className={currentPage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };

  const triggerDownload = (blob: Blob, fileName: string) => {
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
  };

  const handleApplyBulkAction = async () => {
    if (bulkAction === "download") {
      if (activeDocumentsTab === "clinical") {
        // Recompute the same sorted list used by the clinical table render
        const sortedNotes = clinicalSortOrder
          ? [...clinicalNotes].sort((a, b) => {
              const nameA = (a.template_name || a?.name || a?.note_title || a?.title || '').toLowerCase();
              const nameB = (b.template_name || b?.name || b?.note_title || b?.title || '').toLowerCase();
              return clinicalSortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
            })
          : clinicalNotes;

        const selectedNotes = selectedNewFormIndexes
          .map((index) => sortedNotes[index])
          .filter((note): note is ClinicalNote => Boolean(note));

        if (selectedNotes.length === 0) {
          toast.error("Please select at least one file to download", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
          return;
        }

        setIsBulkDownloading(true);
        try {
          if (selectedNotes.length === 1) {
            const note = selectedNotes[0];
            const downloadUrl = note.download_pdf_url;
            if (!downloadUrl) {
              toast.error("Download URL is not available", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
              return;
            }
            const blob = await Apis.getClinicalDocumentBlob(downloadUrl);
            if (!(blob instanceof Blob) || blob.size === 0) throw new Error("The file returned by the server is empty or invalid");
            const title = note.template_name || note?.name || note?.note_title || note?.title || "clinical-note";
            const sanitizedTitle = title.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
            triggerDownload(blob, sanitizedTitle ? `${sanitizedTitle}.pdf` : "clinical-note.pdf");
          } else {
            const JSZip = (await import("jszip")).default;
            const zip = new JSZip();
            const caseId = getActiveCaseId();
            for (const note of selectedNotes) {
              const downloadUrl = note.download_pdf_url;
              if (!downloadUrl) continue;
              try {
                const blob = await Apis.getClinicalDocumentBlob(downloadUrl);
                if (!(blob instanceof Blob) || blob.size === 0) continue;
                const title = note.template_name || note?.name || note?.note_title || note?.title || "clinical-note";
                const sanitizedTitle = title.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
                const noteId = note.amd_note_id ?? note.note_id ?? note.id ?? "";
                const fileName = sanitizedTitle ? `${sanitizedTitle}.pdf` : `clinical-note-${noteId}.pdf`;
                zip.file(fileName, blob);
              } catch (err) {
                const msg = getApiErrorMessage(err) || `Failed to fetch file`;
                toast.error(msg, { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
              }
            }
            const zipBlob = await zip.generateAsync({ type: "blob" });
            const zipName = caseId ? `documents-${caseId}.zip` : "clinical-documents.zip";
            triggerDownload(zipBlob, zipName);
          }
          toast.success("Download successful", { style: { background: "#16a34a", color: "#fff", border: "none" } });
        } catch (err) {
          const msg = getApiErrorMessage(err) || "Failed to download files";
          toast.error(msg, { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
        } finally {
          setIsBulkDownloading(false);
        }
        return;
      }

      // Administrative tab — recompute the same sorted list used by the admin table render
      const sortedAdminNotesBulk = adminSortOrder
        ? [...adminNotes].sort((a, b) => {
            const nameA = (a?.filename || a?.file_name || a?.name || '').toLowerCase();
            const nameB = (b?.filename || b?.file_name || b?.name || '').toLowerCase();
            return adminSortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
          })
        : adminNotes;

      const selectedAdminNotes = selectedOldFormIndexes
        .map((index) => sortedAdminNotesBulk[index])
        .filter((note): note is any => Boolean(note));

      if (selectedAdminNotes.length === 0) {
        toast.error("Please select at least one file to download", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
        return;
      }

      setIsBulkDownloading(true);
      try {
        if (selectedAdminNotes.length === 1) {
          const note = selectedAdminNotes[0];
          const url = note?.download_url ?? note?.file_url ?? note?.url ?? note?.download_pdf_url ?? note?.view_url ?? "";
          if (!url) {
            toast.error("Download URL is not available", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
            return;
          }
          const blob = await Apis.getClinicalDocumentBlob(url);
          if (!(blob instanceof Blob) || blob.size === 0) throw new Error("The file returned by the server is empty or invalid");
          const filename = note?.filename ?? note?.file_name ?? note?.name ?? "administrative-note";
          const sanitized = filename.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
          triggerDownload(blob, sanitized || "administrative-note");
        } else {
          const JSZip = (await import("jszip")).default;
          const zip = new JSZip();
          const caseId = getActiveCaseId();
          for (const note of selectedAdminNotes) {
            const url = note?.download_url ?? note?.file_url ?? note?.url ?? note?.download_pdf_url ?? note?.view_url ?? "";
            if (!url) continue;
            try {
              const blob = await Apis.getClinicalDocumentBlob(url);
              if (!(blob instanceof Blob) || blob.size === 0) continue;
              const filename = note?.filename ?? note?.file_name ?? note?.name ?? "administrative-note";
              zip.file(filename, blob);
            } catch (err) {
              const msg = getApiErrorMessage(err) || `Failed to fetch file`;
              toast.error(msg, { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
            }
          }
          const zipBlob = await zip.generateAsync({ type: "blob" });
          const zipName = caseId ? `documents-${caseId}.zip` : "administrative-documents.zip";
          triggerDownload(zipBlob, zipName);
        }
        toast.success("Download successful", { style: { background: "#16a34a", color: "#fff", border: "none" } });
      } catch (err) {
        const msg = getApiErrorMessage(err) || "Failed to download files";
        toast.error(msg, { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
      } finally {
        setIsBulkDownloading(false);
      }
      return;
    }

    toast.error("Please select a bulk action", {
      style: { backgroundColor: "#ef4444", color: "#ffffff" },
    });
  };

  // Get form fields array from decoded_json — moved to FormViewModal
  const getFormFieldsArray = (form: SubmittedForm): FormField[] => {
    const fieldsSource = form.decoded_json || form.json;
    if (!fieldsSource) return [];
    if (Array.isArray(fieldsSource)) {
      return fieldsSource;
    }
    return Object.values(fieldsSource);
  };

  const isOptionSelected = (field: FormField, option: Record<string, any>) => {
    const fieldValue = field.value;

    if (option.selected === 1 || option.selected === true || option.checked === 1 || option.checked === true) {
      return true;
    }

    if (Array.isArray(fieldValue)) {
      return fieldValue.includes(option.value) || fieldValue.includes(option.label);
    }

    return fieldValue === option.value || fieldValue === option.label;
  };

  // Render form field according to API field type
  const renderRequiredLabel = (label: string, required?: boolean) => (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      {required === true && <span className="text-red-500">*</span>}
    </span>
  );

  const renderFormField = (field: FormField, index: number, isFirstField = false) => {
    const fieldLabel = field.label || field.name || `Field ${index + 1}`;
    const options = Array.isArray(field.values) ? field.values : [];
    // Also support options[] string array format (funnel-style)
    const stringOptions = Array.isArray(field.options) ? field.options : [];

    // Skip break type fields entirely (spacers from form builder)
    if (field.type === "break") {
      return null;
    }

    // Clean &nbsp; from labels and values - skip if only &nbsp; with no real content
    const cleanLabel = fieldLabel.replace(/&nbsp;/g, '').replace(/\u00A0/g, '').trim();
    const cleanValue = (field.value || "").toString().replace(/&nbsp;/g, '').replace(/\u00A0/g, '').trim();
    const cleanContent = (field.content || "").replace(/&nbsp;/g, '').replace(/\u00A0/g, '').trim();
    if (!cleanLabel && !cleanValue && !cleanContent && field.type !== "divider") {
      return null;
    }

    // Submit type - render nothing
    if (field.type === "submit") {
      return null;
    }

    // Divider type - horizontal rule
    if (field.type === "divider") {
      return <hr key={index} className="my-4 border-border" />;
    }

    // Header type - section header matching funnel form style
    if (field.type === "header") {
      const headerContainerClassName = isFirstField
        ? ""
        : "border-t border-border pt-4 mt-2";

      return (
        <div key={index} className={headerContainerClassName}>
          <h3 className="text-base font-semibold text-foreground">
            {field.content || fieldLabel || ""}
          </h3>
        </div>
      );
    }

    // Textarea type - full width, min 3 rows, preserve line breaks
    if (field.type === "textarea") {
      return (
        <div key={index} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">
            {renderRequiredLabel(fieldLabel, field.required)}
          </label>
          <textarea
            name={field.name}
            value={field.value || ""}
            readOnly
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-md bg-muted text-foreground text-sm focus:outline-none cursor-not-allowed resize-none whitespace-pre-wrap"
            placeholder={field.placeholder}
          />
        </div>
      );
    }

    // Password type - masked characters
    if (field.type === "password") {
      const maskedValue = field.value ? "*".repeat(field.value.length) : "";
      return (
        <div key={index} className="flex flex-col gap-1.25">
          <label className="text-sm font-medium text-foreground">
            {renderRequiredLabel(fieldLabel, field.required)}
          </label>
          <input
            type="text"
            name={field.name}
            value={maskedValue}
            readOnly
            className="w-full px-3 py-2 border border-border rounded-md bg-muted text-foreground text-sm focus:outline-none cursor-not-allowed"
          />
        </div>
      );
    }

    // Radio-group type (legacy values[] format)
    if (field.type === "radio-group") {
      return (
        <fieldset key={index} className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</legend>
          <div className="flex flex-row flex-wrap gap-4 mt-1">
            {options.map((option, optionIndex) => {
              const selected = isOptionSelected(field, option);

              return (
                <label key={optionIndex} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name={field.name || `field-${index}`}
                    value={option.value || option.label || ""}
                    checked={selected}
                    readOnly
                    tabIndex={-1}
                    aria-readonly="true"
                    className="h-4 w-4 flex-shrink-0 pointer-events-none accent-gray-500"
                  />
                  <span>{option.label || option.value}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      );
    }

    // Radio type (options[] string array format from funnel forms)
    if (field.type === "radio") {
      const fieldValue = field.value || "";
      const radioOptions = stringOptions.length > 0 ? stringOptions : options.map((o: any) => o.value || o.label || "");
      return (
        <fieldset key={index} className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</legend>
          <div className="flex flex-row flex-wrap gap-4 mt-1">
            {radioOptions.map((option: string, optionIndex: number) => (
              <label key={optionIndex} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name={field.name || `field-${index}`}
                  value={option}
                  checked={fieldValue === option}
                  readOnly
                  tabIndex={-1}
                  aria-readonly="true"
                  className="h-4 w-4 flex-shrink-0 pointer-events-none accent-gray-500"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    }

    // Checkbox type - supports both values[] and options[] formats
    if (field.type === "checkbox") {
      if (stringOptions.length > 0) {
        // Funnel-style options[] string array
        const checkedValues = Array.isArray(field.value) ? field.value : (field.value ? [field.value] : []);
        return (
          <fieldset key={index} className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</legend>
            <div className="flex flex-row flex-wrap gap-4 mt-1">
              {stringOptions.map((option: string, optionIndex: number) => (
                <label key={optionIndex} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    name={field.name || `field-${index}`}
                    value={option}
                    checked={checkedValues.includes(option)}
                    disabled
                    className="h-4 w-4 flex-shrink-0 cursor-not-allowed accent-blue-600"
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      }
      // Legacy values[] object array
      return (
        <fieldset key={index} className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</legend>
          <div className="flex flex-row flex-wrap gap-4 mt-1">
            {options.map((option, optionIndex) => (
              <label key={optionIndex} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  name={field.name || `field-${index}`}
                  value={option.value || option.label || ""}
                  checked={isOptionSelected(field, option)}
                  disabled
                  className="h-4 w-4 flex-shrink-0 cursor-not-allowed accent-blue-600"
                />
                <span>{option.label || option.value}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    }

    // Toggle type - read-only switch UI
    if (field.type === "toggle") {
      const isOn = ["true", "1"].includes(String(field.value));
      return (
        <div key={index} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">
            {renderRequiredLabel(fieldLabel, field.required)}
          </label>
          <div
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-not-allowed ${
              isOn ? "bg-[#8b1a1a]" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isOn ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </div>
        </div>
      );
    }

    // Rating type - star rating display
    if (field.type === "rating") {
      const ratingValue = typeof field.value === "number" ? field.value : parseInt(field.value || "0", 10) || 0;
      return (
        <div key={index} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">
            {renderRequiredLabel(fieldLabel, field.required)}
          </label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`h-6 w-6 ${
                  star <= ratingValue ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                }`}
              />
            ))}
          </div>
        </div>
      );
    }

    // Scale type - read-only range display
    if (field.type === "scale") {
      const scaleValue = typeof field.value === "number" ? field.value : parseInt(field.value || "5", 10) || 5;
      return (
        <div key={index} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">
            {renderRequiredLabel(fieldLabel, field.required)}
          </label>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">1</span>
            <input
              type="range"
              min="1"
              max="10"
              value={scaleValue}
              readOnly
              className="flex-1 accent-[#8b1a1a] pointer-events-none"
            />
            <span className="text-sm text-muted-foreground">10</span>
            <span className="text-sm font-medium text-foreground w-6 text-center">{scaleValue}</span>
          </div>
        </div>
      );
    }

    // Paragraph type - full width text display with proper wrapping
    if (field.type === "paragraph") {
      return (
        <div key={index} className="flex flex-col gap-1.5 w-full max-w-full overflow-hidden">
          <label className="text-sm font-medium text-foreground">
            {renderRequiredLabel(fieldLabel, field.required)}
          </label>
          <p className="text-sm text-foreground leading-relaxed whitespace-normal break-words" style={{ overflowWrap: "break-word", wordBreak: "break-word" }}>
            {field.content || field.value || ""}
          </p>
        </div>
      );
    }

    // Signature type - display signature image
    if (field.type === "signature") {
      const signatureValue = field.value || "";
      const hasSignature = signatureValue && signatureValue.trim().length > 0;

      return (
        <div key={index} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">
            {renderRequiredLabel(fieldLabel, field.required)}
          </label>
          {hasSignature ? (
            <div className="border border-border rounded-md bg-white p-2 inline-block" style={{ maxWidth: "300px" }}>
              <img
                src={signatureValue}
                alt={fieldLabel || "Signature"}
                className="w-full h-auto object-contain"
                style={{ maxHeight: "150px" }}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                  const fallback = target.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = "block";
                }}
              />
              <p className="text-sm text-muted-foreground italic hidden">No signature available</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No signature available</p>
          )}
        </div>
      );
    }

    // File upload type - display file URL with view button inside input
    if (field.type === "file") {
      const fileUrl = field.value || "";
      return (
        <div key={index} className="flex flex-col gap-1.25">
          <label className="text-sm font-medium text-foreground">
            {renderRequiredLabel(fieldLabel, field.required)}
          </label>
          <div className="relative">
            <input
              type="text"
              name={field.name}
              value={fileUrl}
              readOnly
              className="w-full px-3 py-2 pr-10 border border-border rounded-md bg-muted text-foreground text-sm focus:outline-none cursor-not-allowed"
              placeholder={field.placeholder}
            />
            {fileUrl && (
              <button
                type="button"
                onClick={() => window.open(fileUrl, '_blank')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 transition-opacity hover:opacity-80"
                title="View file"
              >
                <Eye className="h-4 w-4" style={{ color: '#7a1a1a' }} />
              </button>
            )}
          </div>
        </div>
      );
    }

    // Image upload type - display image URL with view button inside input
    if (field.type === "image") {
      const imageUrl = field.value || "";
      return (
        <div key={index} className="flex flex-col gap-1.25">
          <label className="text-sm font-medium text-foreground">
            {renderRequiredLabel(fieldLabel, field.required)}
          </label>
          <div className="relative">
            <input
              type="text"
              name={field.name}
              value={imageUrl}
              readOnly
              className="w-full px-3 py-2 pr-10 border border-border rounded-md bg-muted text-foreground text-sm focus:outline-none cursor-not-allowed"
              placeholder={field.placeholder}
            />
            {imageUrl && (
              <button
                type="button"
                onClick={() => window.open(imageUrl, '_blank')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 transition-opacity hover:opacity-80"
                title="View image"
              >
                <Eye className="h-4 w-4" style={{ color: '#7a1a1a' }} />
              </button>
            )}
          </div>
        </div>
      );
    }

    // Default input type - text, email, phone, number, date, time, url, etc.
    return (
      <div key={index} className="flex flex-col gap-1.25">
        <label className="text-sm font-medium text-foreground">
          {renderRequiredLabel(fieldLabel, field.required)}
        </label>
        <input
          type="text"
          name={field.name}
          value={field.value || ""}
          readOnly
          className="w-full px-3 py-2 border border-border rounded-md bg-muted text-foreground text-sm focus:outline-none cursor-not-allowed"
          placeholder={field.placeholder}
        />
      </div>
    );
  };



  // Page-level loader: show single spinner until all data is loaded
  if (isFunnelsLoading || isSelectedFunnelFormsLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents & Forms</h1>
        <p className="text-muted-foreground">Complete pre-visit paperwork and manage your documents.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Action Required Section */}
        {(() => {
          const selectedFunnel = patientFunnels[0];
          const selectedFunnelName = selectedFunnel ? getFunnelName(selectedFunnel) : "Funnel";
          const hasNoFunnels = !funnelsError && patientFunnels.length === 0;
          const pendingCount = selectedFunnelForms.filter((form) => !isFormCompleted(form)).length;
          const funnelStartId = selectedFunnel ? getFunnelId(selectedFunnel) : undefined;
          const hasFunnelStartId = funnelStartId !== undefined && funnelStartId !== null && funnelStartId !== "";
          const totalFormsCount = selectedFunnelForms.length;
          const completedFormsCount = totalFormsCount - pendingCount;
          const funnelProgressValue = totalFormsCount > 0 ? (completedFormsCount / totalFormsCount) * 100 : 0;
          const allFormsCompleted = totalFormsCount > 0 && pendingCount === 0;
          const noneCompleted = pendingCount === totalFormsCount;
          const funnelCtaLabel = totalFormsCount === 0 ? "Start Form" : allFormsCompleted ? "Form Completed" : noneCompleted ? "Start Form" : "Resume Form";
          const isStartingFunnel = editingFunnelId !== null && funnelStartId !== undefined && editingFunnelId === funnelStartId;
          const canStartFunnel = !funnelsError && !isSelectedFunnelFormsLoading && !selectedFunnelFormsError && patientFunnels.length > 0 && selectedFunnelForms.length > 0;
          return (
        <Card className={`lg:col-span-3 shadow-soft border-l-4 ${hasNoFunnels ? "border-l-gray-300" : pendingCount === 0 ? "border-l-green-500" : "border-l-yellow-500"}`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{hasNoFunnels ? "Pre-visit Forms" : "Action Required"}</CardTitle>
                <CardDescription>
                  {hasNoFunnels ? "No forms to complete at this time" : "Please complete these forms before your visit"}
                </CardDescription>
              </div>
              {!hasNoFunnels && (
                <Badge variant="outline" className={pendingCount === 0 ? "bg-green-50 text-green-700 border-green-200" : "bg-yellow-50 text-yellow-700 border-yellow-200"}>
                  {pendingCount === 0 ? "All Complete" : `${pendingCount} Pending`}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-border opacity-75">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-700" />
                </div>
                <div>
                  <h3 className="font-semibold line-through text-muted-foreground">HIPAA Consent</h3>
                  <p className="text-sm text-muted-foreground">Completed on Oct 10, 2024</p>
                </div>
              </div>
              <Button variant="outline" size="sm" disabled>Completed</Button>
            </div> */}

            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-2">
                  {!hasNoFunnels && <CardTitle>{selectedFunnelName}</CardTitle>}
                  {canStartFunnel ? (
                    <div className="flex items-center gap-3">
                      <Progress value={funnelProgressValue} className="h-2 flex-1 bg-secondary" indicatorClassName="bg-primary" />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">{completedFormsCount} of {totalFormsCount} completed</span>
                    </div>
                  ) : null}
                </div>
                {canStartFunnel ? (
                  <Button
                    className="bg-primary hover:bg-primary/90 shrink-0"
                    disabled={allFormsCompleted || isStartingFunnel || !hasFunnelStartId}
                    onClick={() => {
                      if (funnelStartId === undefined || funnelStartId === null || funnelStartId === "") return;
                      setEditingFunnelId(funnelStartId);
                      setLocation(`/form/${encodeURIComponent(String(funnelStartId))}`);
                    }}
                  >
                    {isStartingFunnel ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    {funnelCtaLabel}
                  </Button>
                ) : null}
              </div>
              <div className="space-y-4 max-h-[400px] overflow-y-auto scroll-smooth pr-1 upcoming-visit-forms-scrollbar">
                {funnelsError ? (
                  <div className="p-4 text-sm text-muted-foreground bg-secondary/30 rounded-xl border border-border">
                    {funnelsError}
                  </div>
                ) : isSelectedFunnelFormsLoading ? (
                  <div className="p-4 text-sm text-muted-foreground bg-secondary/30 rounded-xl border border-border">
                    Loading forms...
                  </div>
                ) : selectedFunnelFormsError ? (
                  <div className="p-4 text-sm text-muted-foreground bg-secondary/30 rounded-xl border border-border">
                    {selectedFunnelFormsError}
                  </div>
                ) : patientFunnels.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground bg-secondary/30 rounded-xl border border-border">
                    No funnels available
                  </div>
                ) : selectedFunnelForms.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground bg-secondary/30 rounded-xl border border-border">
                    No forms available
                  </div>
                ) : (
                  selectedFunnelForms.map((form, idx) => {
                    const completed = isFormCompleted(form);

                    return (
                      <div key={form.id || form.form_id || idx} className={`flex items-center justify-between gap-4 p-4 bg-secondary/30 rounded-xl border border-border ${completed ? "opacity-75" : ""}`}>
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${completed ? "bg-green-100" : "bg-yellow-100"}`}>
                            {completed ? (
                              <CheckCircle2 className="h-5 w-5 text-green-700" />
                            ) : (
                              <PenTool className="h-5 w-5 text-yellow-700" />
                            )}
                          </div>
                          <div>
                            <h3 className={`font-semibold ${completed ? "line-through text-muted-foreground" : ""}`}>{getFormName(form)}</h3>
                          </div>
                        </div>
                        {completed && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={funnelFormViewLoadingId === (form.id ?? form.form_id ?? getFormName(form))}
                              onClick={() => handleViewFunnelForm(form)}
                            >
                              {funnelFormViewLoadingId === (form.id ?? form.form_id ?? getFormName(form)) ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              ) : (
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={funnelFormDownloadLoadingId === (form.id ?? form.form_id ?? getFormName(form))}
                              onClick={() => handleDownloadFunnelFormPDF(form)}
                            >
                              {funnelFormDownloadLoadingId === (form.id ?? form.form_id ?? getFormName(form)) ? (
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
          </CardContent>
        </Card>
          );
        })()}

        {/* HIDDEN: Upload Documents card hidden per UI requirements
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Upload Documents</CardTitle>
            <CardDescription>Securely send files to your care team</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:bg-secondary/50 transition-colors cursor-pointer">
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <p className="font-medium">Click to upload or drag and drop</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, JPG, or PNG (Max 10MB)</p>
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium">Recent Uploads</p>
              <div className="flex items-center justify-between p-2 bg-secondary/30 rounded-lg text-sm">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span className="truncate max-w-[150px]">Insurance_Card_Front.jpg</span>
                </div>
                <span className="text-xs text-muted-foreground">Oct 10</span>
              </div>
            </div>
          </CardContent>
        </Card>
        */}
      </div>

      <Tabs value={activeDocumentsTab} onValueChange={handleDocumentsTabChange} className="w-full">
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            {/* <TabsTrigger value="newforms">New Forms</TabsTrigger>
            <TabsTrigger value="oldforms">Old Forms</TabsTrigger> */}
            <TabsTrigger value="clinical">Clinical Documents</TabsTrigger>
            <TabsTrigger value="admin">Administrative</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Select value={bulkAction} onValueChange={setBulkAction}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Bulk Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bulk-action" className="pr-2 [&>span:first-child]:hidden">Bulk Action</SelectItem>
                <SelectItem value="download" className="pr-2 [&>span:first-child]:hidden">Download</SelectItem>
              </SelectContent>
            </Select>
            <Button className="bg-primary hover:bg-primary/90" onClick={handleApplyBulkAction} disabled={isBulkDownloading}>
              {isBulkDownloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Downloading...
                </>
              ) : (
                "Apply"
              )}
            </Button>
          </div>
        </div>

        <TabsContent value="clinical" className="mt-6">
          {/* Temporary commented dynamic listing code */}
          {/*
          {clinicalError ? (
            <div className="p-8 text-center text-red-600">{clinicalError}</div>
          ) : clinicalDocuments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground bg-white rounded-lg shadow-sm">No clinical documents available</div>
          ) : (
            <div className="border border-border rounded-lg shadow-sm bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-100 hover:bg-gray-100">
                  <TableHead className="w-[50px] p-4 box-border"></TableHead>
                  <TableHead className="text-sm font-semibold text-foreground p-4 box-border">
                    <button type="button" className="flex items-center gap-1" onClick={() => setClinicalSortOrder(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}>
                      Form Name
                      <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </TableHead>
                  <TableHead className="text-center text-sm font-semibold text-foreground p-4 w-[50px] box-border">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getPaginatedData(getSortedData(clinicalDocuments, clinicalSortOrder, 'form_title'), clinicalPage).map((doc, pageIdx) => {
                  const idx = (clinicalPage - 1) * ITEMS_PER_PAGE + pageIdx;
                  return (
                    <TableRow key={doc.id || idx}>
                      <TableCell className="p-4">
                        <input
                          type="checkbox"
                          checked={selectedNewFormIndexes.includes(idx)}
                          onChange={(event) => handleNewFormSelectionChange(idx, event.target.checked)}
                          className="h-4 w-4 flex-shrink-0 accent-blue-600 border border-gray-300 rounded"
                          aria-label={`Select ${doc.form_title || doc.title || doc.name || 'Document'}`}
                        />
                      </TableCell>
                      <TableCell className="p-4">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
                          <div>
                            <p className="font-medium text-sm text-foreground">{doc.form_title || doc.title || doc.name || 'Untitled Document'}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.created_at ? formatDate(doc.created_at) : ''}
                              {doc.funnel_name ? ` • ${doc.funnel_name}` : ''}
                              {doc.type ? ` • ${doc.type}` : ''}
                              {doc.size ? ` • ${doc.size}` : ''}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right p-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewForm(doc, "clinical")}
                          >
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownloadClinicalPDF(doc.pdf_url || doc.downloadPdf, doc.form_title || doc.title || doc.name)}
                          >
                            <Download className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
          {!isClinicalLoading && !clinicalError && clinicalDocuments.length > 0 && renderPagination(clinicalPage, clinicalDocuments.length, setClinicalPage)}
          */}
          {isClinicalNotesLoading ? (
            <div className="flex items-center justify-center p-8 bg-white rounded-lg shadow-sm border border-border">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : clinicalNotesError ? (
            <div className="p-8 text-center text-red-600 bg-white rounded-lg shadow-sm border border-border">{clinicalNotesError}</div>
          ) : clinicalNotes.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground bg-white rounded-lg shadow-sm border border-border">No clinical documents available</div>
          ) : (
            (() => {
              const sortedClinicalNotes = clinicalSortOrder
                ? [...clinicalNotes].sort((a, b) => {
                    const nameA = (a.template_name || a?.name || a?.note_title || a?.title || '').toLowerCase();
                    const nameB = (b.template_name || b?.name || b?.note_title || b?.title || '').toLowerCase();
                    return clinicalSortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
                  })
                : clinicalNotes;
              const paginatedClinicalNotes = getPaginatedData(sortedClinicalNotes, clinicalPage);
              return (
                <>
                  <div className="border border-border rounded-lg shadow-sm bg-white overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-100 hover:bg-gray-100">
                          <TableHead className="w-[50px] p-4 box-border"></TableHead>
                          <TableHead className="text-sm font-semibold text-foreground p-4 box-border">
                            <button type="button" className="flex items-center gap-1" onClick={() => setClinicalSortOrder(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}>
                              File Name
                              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </TableHead>
                          <TableHead className="text-center text-sm font-semibold text-foreground p-4 w-[50px] box-border">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedClinicalNotes.map((note, pageIdx) => {
                          const idx = (clinicalPage - 1) * ITEMS_PER_PAGE + pageIdx;
                          const noteId = note.amd_note_id ?? note.note_id ?? note.id ?? idx;
                          const name = note.template_name || note?.name || note?.note_title || note?.title || "Untitled Document";
                          const dateText = note.service_date ? formatDate(note.service_date) : (note?.noteDateTime ? formatDate(note.noteDateTime) : "");
                          return (
                            <TableRow key={noteId}>
                              <TableCell className="p-4">
                                <input
                                  type="checkbox"
                                  checked={selectedNewFormIndexes.includes(idx)}
                                  onChange={(event) => handleNewFormSelectionChange(idx, event.target.checked)}
                                  className="h-4 w-4 flex-shrink-0 accent-blue-600 border border-gray-300 rounded"
                                  aria-label={`Select ${name}`}
                                />
                              </TableCell>
                              <TableCell className="p-4">
                                <div className="flex items-center gap-3">
                                  <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
                                  <div>
                                    <p className="font-medium text-sm text-foreground">{name}</p>
                                    <p className="text-xs text-muted-foreground">{dateText}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right p-4">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={clinicalNoteViewLoadingId === noteId}
                                    onClick={() => {
                                      const url = note.view_pdf_url;
                                      if (!url) {
                                        toast.error("View URL is not available", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
                                        return;
                                      }
                                      setClinicalNoteViewLoadingId(noteId);
                                      const newTab = window.open(url, "_blank");
                                      setClinicalNoteViewLoadingId(null);
                                      if (!newTab) {
                                        toast.error("Popup blocked. Please allow popups for this site.", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
                                      }
                                    }}
                                  >
                                    {clinicalNoteViewLoadingId === noteId ? (
                                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    ) : (
                                      <Eye className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={clinicalNoteDownloadLoadingId === noteId}
                                    onClick={() => handleDownloadClinicalNote(note)}
                                  >
                                    {clinicalNoteDownloadLoadingId === noteId ? (
                                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    ) : (
                                      <Download className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {renderPagination(clinicalPage, clinicalNotes.length, setClinicalPage)}
                </>
              );
            })()
          )}
        </TabsContent>

        <TabsContent value="admin" className="mt-6">
          {isAdminNotesLoading ? (
            <div className="flex items-center justify-center p-8 bg-white rounded-lg shadow-sm border border-border">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : adminNotesError ? (
            <div className="p-8 text-center text-red-600 bg-white rounded-lg shadow-sm border border-border">{adminNotesError}</div>
          ) : adminNotes.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground bg-white rounded-lg shadow-sm border border-border">No administrative documents available</div>
          ) : (
            (() => {
              const sortedAdminNotes = adminSortOrder
                ? [...adminNotes].sort((a, b) => {
                    const nameA = (a?.filename || a?.file_name || a?.name || '').toLowerCase();
                    const nameB = (b?.filename || b?.file_name || b?.name || '').toLowerCase();
                    return adminSortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
                  })
                : adminNotes;
              const paginatedAdminNotes = getPaginatedData(sortedAdminNotes, adminPage);
              return (
                <>
                  <div className="border border-border rounded-lg shadow-sm bg-white overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-100 hover:bg-gray-100">
                          <TableHead className="w-[50px] p-4 box-border"></TableHead>
                          <TableHead className="text-sm font-semibold text-foreground p-4 box-border">
                            <button type="button" className="flex items-center gap-1" onClick={() => setAdminSortOrder(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}>
                              File Name
                              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </TableHead>
                          <TableHead className="text-center text-sm font-semibold text-foreground p-4 w-[50px] box-border">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedAdminNotes.map((note, pageIdx) => {
                          const idx = (adminPage - 1) * ITEMS_PER_PAGE + pageIdx;
                          const filename = note?.filename || note?.file_name || note?.name || "Untitled Document";
                          const dateText = note?.create_date ? formatDate(note.create_date) : "";
                          const itemKey = note?.id ?? idx;
                          return (
                            <TableRow key={note?.id ?? idx}>
                              <TableCell className="p-4">
                                <input
                                  type="checkbox"
                                  checked={selectedOldFormIndexes.includes(idx)}
                                  onChange={(event) => handleOldFormSelectionChange(idx, event.target.checked)}
                                  className="h-4 w-4 flex-shrink-0 accent-blue-600 border border-gray-300 rounded"
                                  aria-label={`Select ${filename}`}
                                />
                              </TableCell>
                              <TableCell className="p-4">
                                <div className="flex items-center gap-3">
                                  <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
                                  <div>
                                    <p className="font-medium text-sm text-foreground">{filename}</p>
                                    {dateText && <p className="text-xs text-muted-foreground">{dateText}</p>}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right p-4">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={adminNoteViewLoadingId === itemKey}
                                    onClick={() => handleViewAdminNote(note, itemKey)}
                                  >
                                    {adminNoteViewLoadingId === itemKey ? (
                                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    ) : (
                                      <Eye className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={adminNoteDownloadLoadingId === itemKey}
                                    onClick={() => handleDownloadAdminNote(note, itemKey)}
                                  >
                                    {adminNoteDownloadLoadingId === itemKey ? (
                                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    ) : (
                                      <Download className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {renderPagination(adminPage, adminNotes.length, setAdminPage)}
                </>
              );
            })()
          )}
        </TabsContent>
      </Tabs>

      <FormViewModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedForm={selectedForm}
        showNoteSection={viewedFormTab !== "admin"}
      />
    </div>
  );
}
