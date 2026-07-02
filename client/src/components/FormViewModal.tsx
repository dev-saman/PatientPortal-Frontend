import { useState, useEffect } from "react";
import { X, Eye, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import Apis from "@/lib/Apis";
import { getApiErrorMessage } from "@/lib/apiError";

export interface SubmittedFormData {
  id?: string | number;
  form_title?: string;
  created_at?: string;
  funnel_name?: string;
  downloadPdf?: string;
  pdf_url?: string;
  json?: FormField[] | Record<string, FormField>;
  decoded_json?: FormField[] | Record<string, FormField>;
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
  content?: string;
  values?: Record<string, any>[];
  options?: string[];
  [key: string]: any;
}

interface HistoryNote {
  id?: number;
  note?: string;
  comment?: string;
  noted_by_name?: string;
  created_at?: string;
  date?: string;
  time?: string;
  [key: string]: any;
}

interface FormViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedForm: SubmittedFormData | null;
  showNoteSection?: boolean;
}

export default function FormViewModal({ isOpen, onClose, selectedForm, showNoteSection = true }: FormViewModalProps) {
  const [noteText, setNoteText] = useState("");
  const [isNoteSubmitting, setIsNoteSubmitting] = useState(false);
  const [latestNote, setLatestNote] = useState<HistoryNote | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyNotes, setHistoryNotes] = useState<HistoryNote[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && selectedForm?.id) {
      fetchLatestNote(selectedForm.id);
    }
    if (!isOpen) {
      setNoteText("");
      setLatestNote(null);
    }
  }, [isOpen, selectedForm?.id]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  const fetchLatestNote = async (submissionId: string | number) => {
    try {
      const response = await Apis.getSubmissionFormNotes(submissionId);
      const notesCandidates = [
        response?.notes,
        response?.data?.notes,
        response?.data?.data?.notes,
        response?.data?.data,
        response?.data,
        response,
      ];
      const notesList = notesCandidates.find((c) => Array.isArray(c));
      setLatestNote(Array.isArray(notesList) && notesList.length > 0 ? notesList[0] : null);
    } catch (error) {
      setLatestNote(null);
      toast.error(getApiErrorMessage(error));
    }
  };

  const fetchHistoryNotes = async (submissionId: string | number) => {
    setIsHistoryLoading(true);
    setHistoryError(null);
    setHistoryNotes([]);
    setIsHistoryModalOpen(true);
    try {
      const response = await Apis.getSubmissionFormNotes(submissionId);
      const notesCandidates = [
        response?.data?.data,
        response?.data,
        response?.notes,
        response?.data?.notes,
        response,
      ];
      const notesList = notesCandidates.find((c) => Array.isArray(c));
      setHistoryNotes(Array.isArray(notesList) ? notesList : []);
    } catch (error) {
      setHistoryNotes([]);
      setHistoryError(getApiErrorMessage(error));
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const formatHistoryDate = (dateString?: string): string => {
    if (!dateString) return "";
    try {
      const isoMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) return `${isoMatch[2]}-${isoMatch[3]}-${isoMatch[1]}`;
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");
      return `${mm}-${dd}-${date.getFullYear()}`;
    } catch {
      return dateString;
    }
  };

  const formatTimeTo12Hour = (time?: string): string => {
    if (!time) return "";
    try {
      const [h, m] = time.split(":");
      const hour = parseInt(h, 10);
      const ampm = hour >= 12 ? "PM" : "AM";
      const hour12 = hour % 12 || 12;
      return `${hour12.toString().padStart(2, "0")}:${m} ${ampm}`;
    } catch {
      return time;
    }
  };

  const formatHistoryTime = (dateString?: string): string => {
    if (!dateString) return "";
    try {
      return new Date(dateString).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    } catch {
      return "";
    }
  };

  const getFormFieldsArray = (form: SubmittedFormData): FormField[] => {
    const fieldsSource = form.decoded_json || form.json;
    if (!fieldsSource) return [];
    if (Array.isArray(fieldsSource)) return fieldsSource;
    return Object.values(fieldsSource);
  };

  const isOptionSelected = (field: FormField, option: Record<string, any>) => {
    const fieldValue = field.value;
    if (option.selected === 1 || option.selected === true || option.checked === 1 || option.checked === true) return true;
    if (Array.isArray(fieldValue)) return fieldValue.includes(option.value) || fieldValue.includes(option.label);
    return fieldValue === option.value || fieldValue === option.label;
  };

  const renderRequiredLabel = (label: string, required?: boolean) => (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      {required === true && <span className="text-red-500">*</span>}
    </span>
  );

  const renderFormField = (field: FormField, index: number, isFirstField = false) => {
    const fieldLabel = field.label || field.name || `Field ${index + 1}`;
    const options = Array.isArray(field.values) ? field.values : [];
    const stringOptions = Array.isArray(field.options) ? field.options : [];

    if (field.type === "break") return null;

    const cleanLabel = fieldLabel.replace(/&nbsp;/g, "").replace(/ /g, "").trim();
    const cleanValue = (field.value || "").toString().replace(/&nbsp;/g, "").replace(/ /g, "").trim();
    const cleanContent = (field.content || "").replace(/&nbsp;/g, "").replace(/ /g, "").trim();
    if (!cleanLabel && !cleanValue && !cleanContent && field.type !== "divider") return null;

    if (field.type === "submit") return null;

    if (field.type === "divider") return <hr key={index} className="my-4 border-border" />;

    if (field.type === "header") {
      return (
        <div key={index} className={isFirstField ? "" : "border-t border-border pt-4 mt-2"}>
          <h3 className="text-base font-semibold text-foreground">{field.content || fieldLabel || ""}</h3>
        </div>
      );
    }

    if (field.type === "textarea") {
      return (
        <div key={index} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</label>
          <textarea name={field.name} value={field.value || ""} readOnly rows={3}
            className="w-full px-3 py-2 border border-border rounded-md bg-muted text-foreground text-sm focus:outline-none cursor-not-allowed resize-none whitespace-pre-wrap"
            placeholder={field.placeholder} />
        </div>
      );
    }

    if (field.type === "password") {
      const maskedValue = field.value ? "*".repeat(field.value.length) : "";
      return (
        <div key={index} className="flex flex-col gap-1.25">
          <label className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</label>
          <input type="text" name={field.name} value={maskedValue} readOnly
            className="w-full px-3 py-2 border border-border rounded-md bg-muted text-foreground text-sm focus:outline-none cursor-not-allowed" />
        </div>
      );
    }

    if (field.type === "radio-group") {
      return (
        <fieldset key={index} className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</legend>
          <div className="flex flex-row flex-wrap gap-4 mt-1">
            {options.map((option, optionIndex) => (
              <label key={optionIndex} className="flex items-center gap-2 text-sm text-foreground">
                <input type="radio" name={field.name || `field-${index}`} value={option.value || option.label || ""}
                  checked={isOptionSelected(field, option)} readOnly tabIndex={-1} aria-readonly="true"
                  className="h-4 w-4 flex-shrink-0 pointer-events-none accent-gray-500" />
                <span>{option.label || option.value}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    }

    if (field.type === "radio") {
      const fieldValue = field.value || "";
      const radioOptions = stringOptions.length > 0 ? stringOptions : options.map((o: any) => o.value || o.label || "");
      return (
        <fieldset key={index} className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</legend>
          <div className="flex flex-row flex-wrap gap-4 mt-1">
            {radioOptions.map((option: string, optionIndex: number) => (
              <label key={optionIndex} className="flex items-center gap-2 text-sm text-foreground">
                <input type="radio" name={field.name || `field-${index}`} value={option}
                  checked={fieldValue === option} readOnly tabIndex={-1} aria-readonly="true"
                  className="h-4 w-4 flex-shrink-0 pointer-events-none accent-gray-500" />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    }

    if (field.type === "checkbox") {
      if (stringOptions.length > 0) {
        const checkedValues = Array.isArray(field.value) ? field.value : (field.value ? [field.value] : []);
        return (
          <fieldset key={index} className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</legend>
            <div className="flex flex-row flex-wrap gap-4 mt-1">
              {stringOptions.map((option: string, optionIndex: number) => (
                <label key={optionIndex} className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" name={field.name || `field-${index}`} value={option}
                    checked={checkedValues.includes(option)} disabled
                    className="h-4 w-4 flex-shrink-0 cursor-not-allowed accent-blue-600" />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      }
      return (
        <fieldset key={index} className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</legend>
          <div className="flex flex-row flex-wrap gap-4 mt-1">
            {options.map((option, optionIndex) => (
              <label key={optionIndex} className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" name={field.name || `field-${index}`} value={option.value || option.label || ""}
                  checked={isOptionSelected(field, option)} disabled
                  className="h-4 w-4 flex-shrink-0 cursor-not-allowed accent-blue-600" />
                <span>{option.label || option.value}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    }

    if (field.type === "toggle") {
      const isOn = ["true", "1"].includes(String(field.value));
      return (
        <div key={index} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</label>
          <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-not-allowed ${isOn ? "bg-[#8b1a1a]" : "bg-gray-300"}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isOn ? "translate-x-6" : "translate-x-1"}`} />
          </div>
        </div>
      );
    }

    if (field.type === "rating") {
      const ratingValue = typeof field.value === "number" ? field.value : parseInt(field.value || "0", 10) || 0;
      return (
        <div key={index} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star key={star} className={`h-6 w-6 ${star <= ratingValue ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
            ))}
          </div>
        </div>
      );
    }

    if (field.type === "scale") {
      const scaleValue = typeof field.value === "number" ? field.value : parseInt(field.value || "5", 10) || 5;
      return (
        <div key={index} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</label>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">1</span>
            <input type="range" min="1" max="10" value={scaleValue} readOnly className="flex-1 accent-[#8b1a1a] pointer-events-none" />
            <span className="text-sm text-muted-foreground">10</span>
            <span className="text-sm font-medium text-foreground w-6 text-center">{scaleValue}</span>
          </div>
        </div>
      );
    }

    if (field.type === "paragraph") {
      return (
        <div key={index} className="flex flex-col gap-1.5 w-full max-w-full overflow-hidden">
          <label className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</label>
          <p className="text-sm text-foreground leading-relaxed whitespace-normal break-words" style={{ overflowWrap: "break-word", wordBreak: "break-word" }}>
            {field.content || field.value || ""}
          </p>
        </div>
      );
    }

    if (field.type === "signature") {
      const signatureValue = field.value || "";
      const hasSignature = signatureValue && signatureValue.trim().length > 0;
      return (
        <div key={index} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</label>
          {hasSignature ? (
            <div className="border border-border rounded-md bg-white p-2 inline-block" style={{ maxWidth: "300px" }}>
              <img src={signatureValue} alt={fieldLabel || "Signature"} className="w-full h-auto object-contain" style={{ maxHeight: "150px" }}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                  const fallback = target.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = "block";
                }} />
              <p className="text-sm text-muted-foreground italic hidden">No signature available</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No signature available</p>
          )}
        </div>
      );
    }

    if (field.type === "file") {
      const fileUrl = field.value || "";
      return (
        <div key={index} className="flex flex-col gap-1.25">
          <label className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</label>
          <div className="relative">
            <input type="text" name={field.name} value={fileUrl} readOnly
              className="w-full px-3 py-2 pr-10 border border-border rounded-md bg-muted text-foreground text-sm focus:outline-none cursor-not-allowed"
              placeholder={field.placeholder} />
            {fileUrl && (
              <button type="button" onClick={() => window.open(fileUrl, "_blank")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 transition-opacity hover:opacity-80" title="View file">
                <Eye className="h-4 w-4" style={{ color: "#7a1a1a" }} />
              </button>
            )}
          </div>
        </div>
      );
    }

    if (field.type === "image") {
      const imageUrl = field.value || "";
      return (
        <div key={index} className="flex flex-col gap-1.25">
          <label className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</label>
          <div className="relative">
            <input type="text" name={field.name} value={imageUrl} readOnly
              className="w-full px-3 py-2 pr-10 border border-border rounded-md bg-muted text-foreground text-sm focus:outline-none cursor-not-allowed"
              placeholder={field.placeholder} />
            {imageUrl && (
              <button type="button" onClick={() => window.open(imageUrl, "_blank")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 transition-opacity hover:opacity-80" title="View image">
                <Eye className="h-4 w-4" style={{ color: "#7a1a1a" }} />
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div key={index} className="flex flex-col gap-1.25">
        <label className="text-sm font-medium text-foreground">{renderRequiredLabel(fieldLabel, field.required)}</label>
        <input type="text" name={field.name} value={field.value || ""} readOnly
          className="w-full px-3 py-2 border border-border rounded-md bg-muted text-foreground text-sm focus:outline-none cursor-not-allowed"
          placeholder={field.placeholder} />
      </div>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="!max-w-[900px] w-[90%] h-[90vh] p-5 gap-0 pointer-events-auto min-h-auto flex flex-col"
        >
          <DialogHeader className="pb-4 border-b border-border min-h-auto flex-shrink-0">
            <div className="flex items-center justify-between w-full">
              <DialogTitle className="text-xl font-semibold">
                {selectedForm?.form_title}
              </DialogTitle>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4 overflow-auto">
            <div>
              <p className="text-sm font-semibold text-blue-600">
                Funnel Name: {selectedForm?.funnel_name}
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {selectedForm && getFormFieldsArray(selectedForm).map((field, index) =>
                renderFormField(field, index, index === 0)
              )}
            </div>

            {showNoteSection && (
              <div className="border-t border-border pt-4 mt-2">
                <label className="text-sm font-medium text-foreground block mb-2">Add Note:</label>
                <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add your note here..."
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-0 focus:shadow-none resize-vertical min-h-[100px]" />
                <div className="flex items-center gap-3 mt-3">
                  <Button
                    className="bg-primary hover:bg-primary/90"
                    disabled={isNoteSubmitting}
                    onClick={async () => {
                      if (!noteText.trim()) {
                        toast.error("Please enter a note before submitting");
                        return;
                      }
                      if (!selectedForm?.id) {
                        toast.error("Unable to identify the form submission");
                        return;
                      }
                      setIsNoteSubmitting(true);
                      try {
                        const formData = new FormData();
                        formData.append("note", noteText.trim());
                        await Apis.addNoteOnSubmissionForm(selectedForm.id, formData);
                        setNoteText("");
                        toast.success("Note submitted successfully", {
                          style: { background: "#16a34a", color: "#fff", border: "none" },
                        });
                        if (selectedForm?.id) fetchLatestNote(selectedForm.id);
                      } catch (error: any) {
                        toast.error(getApiErrorMessage(error));
                      } finally {
                        setIsNoteSubmitting(false);
                      }
                    }}
                  >
                    {isNoteSubmitting ? "Submitting..." : "Submit"}
                  </Button>
                  <Button
                    className="bg-primary hover:bg-primary/90"
                    onClick={() => {
                      if (!selectedForm?.id) {
                        toast.error("Unable to identify the form submission");
                        return;
                      }
                      fetchHistoryNotes(selectedForm.id);
                    }}
                  >
                    History
                  </Button>
                </div>
                {latestNote && (latestNote.note || latestNote.comment) && (
                  <p className="text-sm text-green-600 mt-3 text-center">
                    <span className="font-medium">Previous Note:</span> {latestNote.note || latestNote.comment}
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Comments History Modal */}
      <Dialog open={isHistoryModalOpen} onOpenChange={setIsHistoryModalOpen}>
        <DialogContent
          showCloseButton={false}
          className="!max-w-[700px] w-[90%] max-h-[80vh] p-0 gap-0 pointer-events-auto overflow-hidden flex flex-col rounded-lg shadow-soft border-0"
        >
          <div className="bg-[#8b1a1a] px-6 py-3 flex items-center justify-between flex-shrink-0 rounded-t-lg">
            <h2 className="text-lg font-bold text-white">Comments History</h2>
            <button onClick={() => setIsHistoryModalOpen(false)} className="text-white/80 hover:text-white transition-colors flex-shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-6 overflow-auto flex-1">
            {isHistoryLoading ? (
              <div className="flex justify-center items-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-gray-200 border-t-red-700" />
              </div>
            ) : historyError ? (
              <div className="text-center text-red-600 py-8">{historyError}</div>
            ) : historyNotes.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">No notes are available.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm border border-border">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-3 py-2 border border-border"><strong>Comment</strong></th>
                      <th className="text-left px-3 py-2 border border-border"><strong>Commented By</strong></th>
                      <th className="text-left px-3 py-2 border border-border"><strong>Date</strong></th>
                      <th className="text-left px-3 py-2 border border-border"><strong>Time</strong></th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyNotes.map((note, idx) => (
                      <tr key={note.id || idx} className="hover:bg-muted/30">
                        <td className="px-3 py-2 border border-border">{note.note || note.comment || ""}</td>
                        <td className="px-3 py-2 border border-border whitespace-nowrap">{note.noted_by_name || ""}</td>
                        <td className="px-3 py-2 border border-border whitespace-nowrap">{note.date || formatHistoryDate(note.created_at)}</td>
                        <td className="px-3 py-2 border border-border whitespace-nowrap">{formatTimeTo12Hour(note.time) || formatHistoryTime(note.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
