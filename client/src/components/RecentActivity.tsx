import { useEffect, useState } from "react";
import { useSelectedCase } from "@/contexts/SelectedCaseContext";
import { FileText, MessageCircle, CreditCard, Activity, Loader2, Pencil } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import Apis from "@/lib/Apis";
import { getApiErrorMessage } from "@/lib/apiError";
import FormViewModal, { type SubmittedFormData } from "@/components/FormViewModal";

interface ActivityItem {
  id?: string | number;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  funnel_id?: string | number;
  form_name?: string;
  submission_id?: string | number;
  action?: string | null;
  [key: string]: any;
}

const formatRelativeDay = (timestamp: string): string => {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return timestamp;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffMs = todayStart.getTime() - dateStart.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return "1 week ago";
    if (diffDays < 21) return "2 weeks ago";
    if (diffDays < 28) return "3 weeks ago";
    const diffMonths = Math.round(diffDays / 30);
    if (diffMonths === 1) return "1 month ago";
    if (diffMonths < 12) return `${diffMonths} months ago`;
    const diffYears = Math.round(diffDays / 365);
    return diffYears === 1 ? "1 year ago" : `${diffYears} years ago`;
  } catch {
    return timestamp;
  }
};

const getIcon = (item: ActivityItem) => {
  const t = (item.type || "").toLowerCase();
  const title = (item.title || "").toLowerCase();

  if (t === "form_submission" || t === "funnel_assigned") {
    return <FileText className="w-6 h-6 text-blue-500" />;
  }
  if (t === "notification" || t === "message") {
    return <MessageCircle className="w-6 h-6 text-green-500" />;
  }
  if (t === "payment") {
    return <CreditCard className="w-6 h-6 text-purple-500" />;
  }
  if (t.includes("note") || title.includes("note")) {
    return <Pencil className="w-6 h-6 text-orange-500" />;
  }
  return <Activity className="w-6 h-6 text-gray-500" />;
};

const normalizeActivities = (response: any): ActivityItem[] => {
  const candidates = [
    response?.data?.data,
    response?.data,
    response?.activities,
    response?.recent_activities,
    response?.items,
    response,
  ];
  const list = candidates.find((c) => Array.isArray(c));
  return Array.isArray(list)
    ? list.map((item: any) => ({ ...item, ...(item.meta ?? {}) }))
    : [];
};

const normalizeClinicalDocuments = (response: any): any[] => {
  const responseCandidates = [
    response?.data?.data,
    response?.data,
    response?.forms,
    response?.documents,
    response,
  ];
  const rootList = responseCandidates.find((candidate) => Array.isArray(candidate));
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

interface RecentActivityProps {
  /** Called once the initial fetch finishes (success or error). Used by
   *  PatientDashboard to track when this section is ready for display. */
  onLoadComplete?: () => void;
}

export default function RecentActivity({ onLoadComplete }: RecentActivityProps) {
  const [, setLocation] = useLocation();
  const { selectedCaseId } = useSelectedCase();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedForm, setSelectedForm] = useState<SubmittedFormData | null>(null);
  const [formLoadingId, setFormLoadingId] = useState<string | number | null>(null);

  useEffect(() => {
    if (!selectedCaseId) return;

    const fetchActivities = async () => {
      try {
        setIsLoading(true);
        const response = await Apis.getRecentActivity(5);
        const list = normalizeActivities(response);
        setActivities(list);
        setError(null);
      } catch (err) {
        const msg = getApiErrorMessage(err) || "Failed to load recent activity";
        setError(msg);
        setActivities([]);
      } finally {
        setIsLoading(false);
        onLoadComplete?.();
      }
    };

    fetchActivities();
  }, [selectedCaseId]);

  const handleViewForm = async (activity: ActivityItem) => {
    const itemId = activity.id ?? activity.submission_id ?? activity.form_name ?? "form";
    setFormLoadingId(itemId);
    try {
      const response = await Apis.getPatientFormData();
      const normalized = normalizeClinicalDocuments(response);
      const formName = activity.form_name || activity.title || "";
      const matched = formName
        ? (normalized.find(
            (f) => (f.form_title || f.title || f.name || "").toLowerCase() === formName.toLowerCase()
          ) ?? normalized[0])
        : normalized[0];

      if (!matched) {
        toast.error("Form data not available", { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
        return;
      }
      setSelectedForm(matched);
      setIsModalOpen(true);
    } catch (err) {
      const msg = getApiErrorMessage(err) || "Failed to load form data";
      toast.error(msg, { style: { backgroundColor: "#ef4444", color: "#ffffff" } });
    } finally {
      setFormLoadingId(null);
    }
  };

  const renderActionLink = (activity: ActivityItem) => {
    const type = (activity.type || "").toLowerCase();

    if (type === "form_submission") {
      const isLoadingThis = formLoadingId === (activity.id ?? activity.submission_id ?? activity.form_name ?? "form");
      return (
        <button
          onClick={() => handleViewForm(activity)}
          disabled={isLoadingThis}
          className="text-red-600 text-sm font-medium mt-2 inline-flex items-center gap-1 hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoadingThis && <Loader2 className="w-3 h-3 animate-spin" />}
          View Form
        </button>
      );
    }

    if (type === "funnel_assigned") {
      const funnelId = activity.funnel_id;
      if (funnelId === undefined || funnelId === null || funnelId === "") return null;
      return (
        <button
          onClick={() => setLocation(`/form/${encodeURIComponent(String(funnelId))}`)}
          className="text-red-600 text-sm font-medium mt-2 inline-block hover:underline"
        >
          View Funnel
        </button>
      );
    }

    // Other types: show "View" only if a valid action is provided
    const action = activity.action;
    if (!action || typeof action !== "string" || !action.trim()) return null;

    return (
      <a
        href={action}
        className="text-red-600 text-sm font-medium mt-2 inline-block hover:underline"
        target="_blank"
        rel="noreferrer"
      >
        View
      </a>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-6">
        <Activity className="w-5 h-5 text-red-600" />
        <h2 className="text-xl font-semibold text-gray-900">Recent Activity</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="p-4 text-sm text-red-600 bg-white border border-gray-200 rounded-lg">
          {error}
        </div>
      ) : activities.length === 0 ? (
        <div className="p-4 text-sm text-gray-500 bg-white border border-gray-200 rounded-lg text-center">
          No recent activity.
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((item, index) => (
            <div
              key={item.id ?? index}
              className="flex gap-4 p-4 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow"
            >
              <div className="flex-shrink-0 pt-1">{getIcon(item)}</div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{item.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                  </div>
                  <span className="text-sm text-gray-500 flex-shrink-0 whitespace-nowrap">
                    {formatRelativeDay(item.timestamp)}
                  </span>
                </div>

                {renderActionLink(item)}
              </div>
            </div>
          ))}
        </div>
      )}

      <FormViewModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedForm={selectedForm}
        showNoteSection={true}
      />
    </div>
  );
}
