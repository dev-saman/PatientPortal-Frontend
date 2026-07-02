import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Check, Star } from "lucide-react";
import PageLoader from "@/components/PageLoader";
import { toast } from "sonner";
import Apis from "@/lib/Apis";
import { useAuth } from "@/contexts/AuthContext";
import { getApiErrorMessage } from "@/lib/apiError";
import { resolveCurrentCaseFunnelId } from "@/lib/funnels";

// Signature Canvas Component - mouse/pointer drawing only
function SignatureCanvas({ fieldKey, onChange }: { fieldKey: string; onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  const getCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    isDrawingRef.current = true;
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      onChange(canvas.toDataURL());
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="border border-border rounded-md overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={500}
          height={120}
          className="w-full h-[120px] cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      <button
        type="button"
        onClick={clearCanvas}
        className="self-end px-3 py-1 text-xs text-white bg-[#8b1a1a] rounded hover:bg-[#6b1414] transition-colors"
      >
        Clear
      </button>
    </div>
  );
}

interface FieldStyle {
  bold?: boolean;
  italic?: boolean;
  fontSize?: string;
  color?: string;
  bgColor?: string;
}

interface FormField {
  id?: string;
  type: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  helpText?: string;
  width?: string;
  cssClass?: string;
  options?: string[];
  content?: string;
  buttonText?: string;
  style?: FieldStyle;
  // Legacy properties
  name?: string;
  value?: string | null;
  values?: Record<string, any>[];
  [key: string]: any;
}

interface FunnelForm {
  id?: number;
  name: string;
  description?: string;
  submission_status?: string | null;
  fields?: FormField[] | Record<string, FormField>;
  decoded_json?: FormField[] | Record<string, FormField>;
  json?: FormField[] | Record<string, FormField>;
  [key: string]: any;
}

interface StoredFunnelSubmission {
  funnelId?: string | number;
  funnelName?: string;
  submissionDetails?: unknown;
}

const hasPrefillValue = (value: any) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const normalizePrefillValue = (field: FormField, defaultValue: any) => {
  const responseValue = field.value;

  if (!hasPrefillValue(responseValue)) {
    return defaultValue;
  }

  if (field.type === "checkbox") {
    if (Array.isArray(responseValue)) return responseValue;
    return String(responseValue)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (field.type === "toggle") {
    if (typeof responseValue === "boolean") return responseValue;
    const normalizedValue = String(responseValue).trim().toLowerCase();
    return ["true", "yes", "1", "on"].includes(normalizedValue);
  }

  if (field.type === "rating" || field.type === "scale") {
    const numericValue = Number(responseValue);
    return Number.isNaN(numericValue) ? defaultValue : numericValue;
  }

  return responseValue;
};

const getErrorElementId = (fieldKey: string) =>
  `field-error-${fieldKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

export default function PatientFunnelForm() {
  const [, params] = useRoute("/form/:funnelId");
  const funnelId = params?.funnelId ? decodeURIComponent(params.funnelId) : "";
  const [, setLocation] = useLocation();
  const { refreshUserDetails } = useAuth();

  const [forms, setForms] = useState<FunnelForm[]>([]);
  const [selectedFormIndex, setSelectedFormIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form values state: keyed by field id
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  // Validation errors state: keyed by field id
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Submission loading state
  const [isSubmitting, setIsSubmitting] = useState(false);
  // All forms completed state
  const [allFormsCompleted, setAllFormsCompleted] = useState(false);
  // Funnel name from API response (for right card title)
  const [apiFunnelName, setApiFunnelName] = useState<string | null>(null);

  // Clean up redirect timer on unmount
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  const storedFunnel = useMemo<StoredFunnelSubmission | null>(() => {
    if (!funnelId) return null;
    try {
      const storedValue = sessionStorage.getItem(`patient_funnel_${funnelId}`);
      return storedValue ? JSON.parse(storedValue) : null;
    } catch (err) {
      console.error("Error reading patient funnel details:", err);
      return null;
    }
  }, [funnelId]);

  const funnelName = storedFunnel?.funnelName || "Funnel";

  // Get form fields array from a form object
  const getFormFieldsArray = useCallback((form: FunnelForm): FormField[] => {
    const source = form.fields || form.decoded_json || form.json;
    if (!source) return [];
    if (Array.isArray(source)) return source;
    return Object.values(source);
  }, []);

  // Fetch funnel submission details from API
  useEffect(() => {
    let redirecting = false;

    const fetchSubmissionDetails = async () => {
      if (!funnelId) {
        setError("Funnel ID not available");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const response = await Apis.getPatientFunnelSubmissionDetails(funnelId);

        // Extract forms array from response (handle various response shapes)
        const formsCandidates = [
          response?.forms,
          response?.data?.forms,
          response?.data?.data?.forms,
          response?.data,
          response,
        ];
        const formsList = formsCandidates.find(
          (candidate) => Array.isArray(candidate) && candidate.length > 0
        );

        if (formsList && Array.isArray(formsList)) {
          setForms(formsList);
          // Auto-select first form that is not completed
          const firstIncompleteIndex = formsList.findIndex(
            (f: FunnelForm) => f.submission_status !== "completed"
          );
          setSelectedFormIndex(firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0);
        } else {
          setForms([]);
        }

        // Extract funnel_name from API response for right card title
        const funnelNameFromApi =
          response?.funnel_name ||
          response?.data?.funnel_name ||
          response?.data?.data?.funnel_name ||
          null;
        if (funnelNameFromApi) {
          setApiFunnelName(funnelNameFromApi);
        }

        setError(null);
      } catch (err) {
        console.error("Error fetching funnel submission details:", err);
        const message = getApiErrorMessage(err) || null;

        // Self-heal: "Funnel not found for this patient case" means the funnel id
        // in the URL belongs to a different case (e.g. the case was changed in
        // another tab). Resolve the current case's funnel and redirect to it.
        // Only redirect to a different, existing id; otherwise fall back to
        // /documents or surface the original error.
        if (message === "Funnel not found for this patient case") {
          try {
            const resolvedFunnelId = await resolveCurrentCaseFunnelId();
            if (!resolvedFunnelId) {
              redirecting = true;
              setLocation("/documents");
              return;
            }
            if (resolvedFunnelId !== funnelId) {
              redirecting = true;
              setLocation(`/form/${encodeURIComponent(resolvedFunnelId)}`);
              return;
            }
            // Resolved id matches the current route id -> show the normal error.
          } catch {
            redirecting = true;
            setLocation("/documents");
            return;
          }
        }

        setError(message);
        setForms([]);
      } finally {
        if (!redirecting) setIsLoading(false);
      }
    };

    fetchSubmissionDetails();
  }, [funnelId, setLocation]);

  const selectedForm = forms[selectedFormIndex] || null;

  // Reset form values when selected form changes
  useEffect(() => {
    if (selectedForm) {
      const fields = getFormFieldsArray(selectedForm);
      const initialValues: Record<string, any> = {};
      fields.forEach((field) => {
        const key = field.id || field.name || "";
        if (!key) return;

        let defaultValue: any = "";
        if (field.type === "checkbox") {
          defaultValue = [];
        } else if (field.type === "toggle") {
          defaultValue = false;
        } else if (field.type === "rating") {
          defaultValue = 0;
        } else if (field.type === "scale") {
          defaultValue = 5;
        }

        initialValues[key] = normalizePrefillValue(field, defaultValue);
      });
      setFormValues(initialValues);
      setFieldErrors({});
    }
  }, [selectedFormIndex, selectedForm, getFormFieldsArray]);

  // Update a single field value
  const updateFieldValue = (fieldKey: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [fieldKey]: value }));
    // Clear error for this field when user provides a value
    setFieldErrors((prev) => {
      if (prev[fieldKey]) {
        const updated = { ...prev };
        delete updated[fieldKey];
        return updated;
      }
      return prev;
    });
  };

  // Validation and submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedForm || isSubmitting) return;

    const fields = getFormFieldsArray(selectedForm);
    const errors: Record<string, string> = {};

    for (const field of fields) {
      const key = field.id || field.name || "";
      if (!key) continue;
      if (!field.required) continue;

      // Skip non-input types
      if (["header", "paragraph", "divider", "submit"].includes(field.type)) continue;

      const value = formValues[key];
      const fieldName = field.label || "This field";

      if (field.type === "checkbox") {
        if (!Array.isArray(value) || value.length === 0) {
          errors[key] = `${fieldName} is required`;
        }
      } else if (field.type === "toggle") {
        // Toggle is always valid (has a boolean state)
        continue;
      } else if (field.type === "rating") {
        if (!value || value === 0) {
          errors[key] = `${fieldName} is required`;
        }
      } else if (field.type === "scale") {
        // Scale always has a value
        continue;
      } else {
        if (!value || (typeof value === "string" && value.trim() === "")) {
          errors[key] = `${fieldName} is required`;
        }
      }
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      const firstErrorKey = fields
        .map((field) => field.id || field.name || "")
        .find((key) => key && errors[key]);

      if (firstErrorKey) {
        requestAnimationFrame(() => {
          const errorElement = document.getElementById(getErrorElementId(firstErrorKey));
          if (errorElement) {
            errorElement.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        });
      }

      return;
    }

    // Build FormData payload
    const formData = new FormData();
    formData.append("funnel_id", String(funnelId));

    for (const field of fields) {
      const key = field.id || field.name || "";
      if (!key) continue;
      // Skip non-input types
      if (["header", "paragraph", "divider", "submit"].includes(field.type)) continue;

      const value = formValues[key];

      const fieldLabel = field.label || "";
      formData.append(`fields[${key}][lable]`, fieldLabel);

      if (field.type === "checkbox" && Array.isArray(value)) {
        formData.append(`fields[${key}][value]`, value.join(", "));
      } else if (field.type === "toggle") {
        formData.append(`fields[${key}][value]`, value ? "Yes" : "No");
      } else if (field.type === "rating" || field.type === "scale") {
        formData.append(`fields[${key}][value]`, String(value));
      } else if (value instanceof File) {
        formData.append(`fields[${key}][value]`, value, value.name);
      } else {
        formData.append(`fields[${key}][value]`, value != null ? String(value) : "");
      }
    }

    // Submit to API
    const formId = selectedForm.id;
    if (!formId) {
      toast.error("Form ID is not available. Cannot submit.");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await Apis.assignPatientFormSubmission(formId, formData);

      if (response?.success === false) {
        throw new Error(response?.message || response?.error || "");
      }

      await refreshUserDetails();

      toast.success("Form submitted successfully");

      // Update local state: mark current form as completed
      const updatedForms = forms.map((f, i) =>
        i === selectedFormIndex ? { ...f, submission_status: "completed" } : f
      );
      setForms(updatedForms);

      // Check if all forms are now completed
      const hasIncomplete = updatedForms.some(
        (f) => f.submission_status !== "completed"
      );

      if (!hasIncomplete) {
        // All forms completed - show completed state and redirect
        setAllFormsCompleted(true);
        setTimeout(() => {
          setLocation("/documents");
        }, 2000);
      } else {
        // Navigate to next incomplete form after a brief delay
        setTimeout(() => {
          const nextIncomplete = updatedForms.findIndex(
            (f, i) => i > selectedFormIndex && f.submission_status !== "completed"
          );
          if (nextIncomplete >= 0) {
            setSelectedFormIndex(nextIncomplete);
          } else {
            // Wrap around: find first incomplete form from beginning
            const firstIncomplete = updatedForms.findIndex(
              (f) => f.submission_status !== "completed"
            );
            if (firstIncomplete >= 0) {
              setSelectedFormIndex(firstIncomplete);
            }
          }
        }, 500);
      }
    } catch (err: any) {
      console.error("Error submitting form:", err);
      toast.error(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render a single form field
  // Error message component
  const FieldError = ({ fieldKey }: { fieldKey: string }) => {
    const errorMsg = fieldErrors[fieldKey];
    if (!errorMsg) return null;
    return (
      <p id={getErrorElementId(fieldKey)} className="text-xs text-red-500 mt-1">
        {errorMsg}
      </p>
    );
  };

  const renderFormField = (field: FormField, index: number) => {
    const fieldKey = field.id || field.name || `field-${index}`;
    const fieldLabel = field.label;
    const options = Array.isArray(field.options) ? field.options : [];
    const value = formValues[fieldKey];

    // Header type - display as section header
    if (field.type === "header") {
      return (
        <div key={fieldKey} className="mt-4">
          <h3 className="text-base font-semibold text-foreground">
            {field.content || fieldLabel || ""}
          </h3>
        </div>
      );
    }

    // Paragraph type - display as text
    if (field.type === "paragraph") {
      return (
        <div key={fieldKey} className="mt-2">
          <p className="text-sm text-muted-foreground">
            {field.content || ""}
          </p>
        </div>
      );
    }

    // Divider type
    if (field.type === "divider") {
      return <hr key={fieldKey} className="my-4 border-border" />;
    }

    // Submit button type
    if (field.type === "submit") {
      return (
        <div key={fieldKey} className="mt-6">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-[#8b1a1a] text-white font-medium rounded-md hover:bg-[#6b1414] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? "Submitting..." : (field.buttonText || "Submit")}
          </button>
        </div>
      );
    }

    // Image type - file upload for images
    if (field.type === "image") {
      const fileName = value instanceof File ? value.name : (value || "");
      return (
        <div key={fieldKey} className="flex flex-col gap-1.5">
          {fieldLabel && (
            <label className="text-sm font-medium text-foreground">
              {fieldLabel}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
          )}
          <label className="flex items-center border border-border rounded-md overflow-hidden bg-background cursor-pointer">
            <span className="px-4 py-2 bg-gray-200 text-sm text-foreground font-medium hover:bg-gray-300 transition-colors whitespace-nowrap">
              Choose file
            </span>
            <span className="flex-1 px-3 py-2 text-sm text-muted-foreground text-right">
              {fileName || "No file chosen"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => updateFieldValue(fieldKey, e.target.files?.[0] || "")}
            />
          </label>
          <FieldError fieldKey={fieldKey} />
        </div>
      );
    }

    // File type
    if (field.type === "file") {
      const fileName = value instanceof File ? value.name : (value || "");
      return (
        <div key={fieldKey} className="flex flex-col gap-1.5">
          {fieldLabel && (
            <label className="text-sm font-medium text-foreground">
              {fieldLabel}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
          )}
          <label className="flex items-center border border-border rounded-md overflow-hidden bg-background cursor-pointer">
            <span className="px-4 py-2 bg-gray-200 text-sm text-foreground font-medium hover:bg-gray-300 transition-colors whitespace-nowrap">
              Choose file
            </span>
            <span className="flex-1 px-3 py-2 text-sm text-muted-foreground text-right">
              {fileName || "No file chosen"}
            </span>
            <input
              type="file"
              className="hidden"
              onChange={(e) => updateFieldValue(fieldKey, e.target.files?.[0] || "")}
            />
          </label>
          <FieldError fieldKey={fieldKey} />
        </div>
      );
    }

    // Radio type
    if (field.type === "radio") {
      return (
        <fieldset key={fieldKey} className="flex flex-col gap-2">
          {fieldLabel && (
            <legend className="text-sm font-medium text-foreground">
              {fieldLabel}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </legend>
          )}
          <div className="flex flex-row flex-wrap gap-4 mt-1">
            {options.map((option, optionIndex) => (
              <label key={optionIndex} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="radio"
                  name={fieldKey}
                  value={option}
                  checked={value === option}
                  onChange={() => updateFieldValue(fieldKey, option)}
                  className="h-4 w-4 flex-shrink-0 accent-[#8b1a1a]"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
          <FieldError fieldKey={fieldKey} />
        </fieldset>
      );
    }

    // Checkbox type
    if (field.type === "checkbox") {
      const checkedValues = Array.isArray(value) ? value : [];
      return (
        <fieldset key={fieldKey} className="flex flex-col gap-2">
          {fieldLabel && (
            <legend className="text-sm font-medium text-foreground">
              {fieldLabel}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </legend>
          )}
          <div className="flex flex-row flex-wrap gap-4 mt-1">
            {options.map((option, optionIndex) => (
              <label key={optionIndex} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  name={fieldKey}
                  value={option}
                  checked={checkedValues.includes(option)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      updateFieldValue(fieldKey, [...checkedValues, option]);
                    } else {
                      updateFieldValue(fieldKey, checkedValues.filter((v: string) => v !== option));
                    }
                  }}
                  className="h-4 w-4 flex-shrink-0 accent-[#8b1a1a]"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
          <FieldError fieldKey={fieldKey} />
        </fieldset>
      );
    }

    // Dropdown type
    if (field.type === "dropdown") {
      return (
        <div key={fieldKey} className="flex flex-col gap-1.5">
          {fieldLabel && (
            <label className="text-sm font-medium text-foreground">
              {fieldLabel}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
          )}
          <select
            value={value || ""}
            onChange={(e) => updateFieldValue(fieldKey, e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[#8b1a1a]/20 focus:border-[#8b1a1a]"
          >
            <option value="">{field.placeholder || "Select an option..."}</option>
            {options.map((option, optionIndex) => (
              <option key={optionIndex} value={option}>{option}</option>
            ))}
          </select>
          <FieldError fieldKey={fieldKey} />
        </div>
      );
    }

    // Toggle type
    if (field.type === "toggle") {
      return (
        <div key={fieldKey} className="flex flex-col gap-1.5">
          {fieldLabel && (
            <label className="text-sm font-medium text-foreground">
              {fieldLabel}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
          )}
          <button
            type="button"
            onClick={() => updateFieldValue(fieldKey, !value)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              value ? "bg-[#8b1a1a]" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                value ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <FieldError fieldKey={fieldKey} />
        </div>
      );
    }

    // Rating type (star rating)
    if (field.type === "rating") {
      const ratingValue = typeof value === "number" ? value : 0;
      return (
        <div key={fieldKey} className="flex flex-col gap-1.5">
          {fieldLabel && (
            <label className="text-sm font-medium text-foreground">
              {fieldLabel}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
          )}
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => updateFieldValue(fieldKey, star)}
                className="p-0 border-0 bg-transparent cursor-pointer"
              >
                <Star
                  className={`h-6 w-6 ${
                    star <= ratingValue ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                  }`}
                />
              </button>
            ))}
          </div>
          <FieldError fieldKey={fieldKey} />
        </div>
      );
    }

    // Scale type (1-10 slider)
    if (field.type === "scale") {
      const scaleValue = typeof value === "number" ? value : 5;
      return (
        <div key={fieldKey} className="flex flex-col gap-1.5">
          {fieldLabel && (
            <label className="text-sm font-medium text-foreground">
              {fieldLabel}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
          )}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">1</span>
            <input
              type="range"
              min="1"
              max="10"
              value={scaleValue}
              onChange={(e) => updateFieldValue(fieldKey, parseInt(e.target.value))}
              className="flex-1 accent-[#8b1a1a]"
            />
            <span className="text-sm text-muted-foreground">10</span>
            <span className="text-sm font-medium text-foreground w-6 text-center">{scaleValue}</span>
          </div>
          <FieldError fieldKey={fieldKey} />
        </div>
      );
    }

    // Signature type - canvas-based drawing
    if (field.type === "signature") {
      return (
        <div key={fieldKey} className="flex flex-col gap-1.5">
          {fieldLabel && (
            <label className="text-sm font-medium text-foreground">
              {fieldLabel}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
          )}
          <SignatureCanvas
            fieldKey={fieldKey}
            onChange={(dataUrl: string) => updateFieldValue(fieldKey, dataUrl)}
          />
          <FieldError fieldKey={fieldKey} />
        </div>
      );
    }

    // Address type
    if (field.type === "address") {
      return (
        <div key={fieldKey} className="flex flex-col gap-1.5">
          {fieldLabel && (
            <label className="text-sm font-medium text-foreground">
              {fieldLabel}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
          )}
          <textarea
            value={value || ""}
            onChange={(e) => updateFieldValue(fieldKey, e.target.value)}
            placeholder={field.placeholder || "Enter address..."}
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[#8b1a1a]/20 focus:border-[#8b1a1a] resize-none"
          />
          <FieldError fieldKey={fieldKey} />
        </div>
      );
    }

    // Name type
    if (field.type === "name") {
      return (
        <div key={fieldKey} className="flex flex-col gap-1.5">
          {fieldLabel && (
            <label className="text-sm font-medium text-foreground">
              {fieldLabel}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
          )}
          <input
            type="text"
            value={value || ""}
            onChange={(e) => updateFieldValue(fieldKey, e.target.value)}
            placeholder={field.placeholder || "Enter full name..."}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[#8b1a1a]/20 focus:border-[#8b1a1a]"
          />
          <FieldError fieldKey={fieldKey} />
        </div>
      );
    }

    // Textarea type
    if (field.type === "textarea") {
      return (
        <div key={fieldKey} className="flex flex-col gap-1.5">
          {fieldLabel && (
            <label className="text-sm font-medium text-foreground">
              {fieldLabel}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
          )}
          <textarea
            value={value || ""}
            onChange={(e) => updateFieldValue(fieldKey, e.target.value)}
            placeholder={field.placeholder || ""}
            rows={4}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[#8b1a1a]/20 focus:border-[#8b1a1a] resize-none"
          />
          <FieldError fieldKey={fieldKey} />
        </div>
      );
    }

    // Default input types: text, email, phone, number, password, time, date, url, etc.
    const inputType = field.type === "phone" ? "tel" : field.type;

    return (
      <div key={fieldKey} className="flex flex-col gap-1.5">
        {fieldLabel && (
          <label className="text-sm font-medium text-foreground">
            {fieldLabel}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <input
          type={inputType}
          value={value || ""}
          onChange={(e) => updateFieldValue(fieldKey, e.target.value)}
          placeholder={field.placeholder || ""}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[#8b1a1a]/20 focus:border-[#8b1a1a]"
        />
        <FieldError fieldKey={fieldKey} />
      </div>
    );
  };

  if (isLoading) {
    return <PageLoader />;
  }

  const isFunnelNotFoundError = error === "Funnel not found for this patient case";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{funnelName}</h1>
        {isFunnelNotFoundError ? (
          <p className="mt-3 text-red-600">{error}</p>
        ) : null}
      </div>

      {!isFunnelNotFoundError ? (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Card - Selected Form Content */}
        <Card className={`lg:col-span-2 overflow-hidden border-0 p-0 gap-0 ${allFormsCompleted ? "shadow-none" : "shadow-soft"}`}>
          {!allFormsCompleted && (
            <CardHeader className="block bg-[#8b1a1a] px-6 py-3">
              <CardTitle className="text-white text-left text-lg font-bold">
                {selectedForm?.name || "Select a form"}
              </CardTitle>
            </CardHeader>
          )}
          <CardContent className={allFormsCompleted ? "p-6 pt-4" : "p-6"}>
            {allFormsCompleted ? (
              <div>
                <p className="font-bold text-3xl text-green-600 text-center">Completed</p>
              </div>
            ) : error ? (
              <div className="p-8 text-center text-red-600">{error}</div>
            ) : !selectedForm ? (
              <div className="p-8 text-center text-muted-foreground">No form selected</div>
            ) : selectedForm.submission_status === "completed" ? (
              <div className="p-0 text-center">
                <p className="text-green-600 font-semibold text-lg">Completed</p>
                <p className="text-sm text-muted-foreground mt-2">Loading Next Form...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {selectedForm.description && (
                  <p className="text-sm text-muted-foreground font-bold">{selectedForm.description}</p>
                )}
                <div className="flex flex-col gap-4">
                  {getFormFieldsArray(selectedForm).map((field, index) =>
                    renderFormField(field, index)
                  )}
                </div>
                {/* Fallback submit button if no submit field type exists */}
                {!getFormFieldsArray(selectedForm).some((f) => f.type === "submit") && (
                  <div className="mt-6">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-6 py-2 bg-[#8b1a1a] text-white font-medium rounded-md hover:bg-[#6b1414] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {isSubmitting ? "Submitting..." : "Submit Form"}
                    </button>
                  </div>
                )}
              </form>
            )}
          </CardContent>
        </Card>

        {/* Right Card - Updated Consents (Form Selector) */}
        <Card className="overflow-hidden border-0 shadow-soft h-fit p-0 gap-0">
          <CardHeader className="block bg-[#8b1a1a] px-6 py-3">
            <CardTitle className="text-white text-center text-lg font-bold">
              {apiFunnelName || "Updated Consents"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-2">
            {error ? (
              <div className="p-4 text-sm text-muted-foreground">
                {error}
              </div>
            ) : forms.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No forms available
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {forms.map((form, idx) => {
                    const isActive = idx === selectedFormIndex;
                    const isCompleted = form.submission_status === "completed";
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          // Clear any existing redirect timer
                          if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);

                          // Find the first pending/incomplete form (the only active editable form)
                          const firstPendingIndex = forms.findIndex(
                            (f) => f.submission_status !== "completed"
                          );

                          // Always show the clicked form first (temporary preview)
                          setSelectedFormIndex(idx);

                          // If the clicked form is NOT the first pending form, auto-redirect back after 2 seconds
                          if (firstPendingIndex >= 0 && idx !== firstPendingIndex) {
                            redirectTimerRef.current = setTimeout(() => {
                              setSelectedFormIndex(firstPendingIndex);
                            }, 2000);
                          }
                        }}
                        className={`flex items-center gap-3 cursor-pointer transition-colors p-2 ${
                          isActive ? "bg-[#f3f3f3] rounded-[5px]" : ""
                        }`}
                      >
                        {isCompleted ? (
                          <div className="h-5 w-5 flex-shrink-0 rounded-full bg-[#8b1a1a] flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" strokeWidth={3} />
                          </div>
                        ) : (
                          <div className={`h-5 w-5 flex-shrink-0 rounded-full flex items-center justify-center ${
                            isActive ? "bg-white" : "bg-[#f3f3f3]"
                          }`}>
                            <Check className={`h-3 w-3 ${isActive ? "text-gray-700" : "text-gray-500"}`} strokeWidth={2} />
                          </div>
                        )}
                        <span className={`text-sm ${
                          isCompleted
                            ? "text-[#8b1a1a] font-medium"
                            : "text-gray-500"
                        }`}>
                          {form.name || `Form ${idx + 1}`}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Progress Indicator */}
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-sm text-center text-foreground font-medium mb-2">
                    {forms.filter((f) => f.submission_status === "completed").length}/{forms.length} Completed
                  </p>
                  <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#8b1a1a] rounded-full transition-all duration-500 ease-in-out"
                      style={{
                        width: `${forms.length > 0 ? (forms.filter((f) => f.submission_status === "completed").length / forms.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

              </>
            )}
          </CardContent>
        </Card>
      </div>
      ) : null}
    </div>
  );
}
