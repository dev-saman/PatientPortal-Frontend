import { CheckCircle2, PenTool, Eye, Download, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  PatientAssignedFunnel,
  PatientFunnelFormSummary,
  computeFunnelProgress,
  getFunnelCtaLabel,
  isFunnelFormCompleted,
} from "@/lib/patientFunnels";

/**
 * Space-efficient accordion presentation of a case's assigned funnels.
 *
 * Replaces the multi-funnel grid of {@link PatientFunnelCard}s on the Dashboard
 * and Documents pages. Each funnel collapses to a compact header (name, progress,
 * pending badge and its own Start/Resume button); expanding reveals that funnel's
 * form list. The parent still owns navigation, preview and download — behavior is
 * identical to the grid it replaces.
 *
 * Two variants keep each page's existing look:
 *  - "dashboard": red accent, gray surfaces (Your Assigned Forms).
 *  - "documents": primary accent, left status border (Action Required).
 */
export interface PatientFunnelAccordionProps {
  variant: "dashboard" | "documents";
  funnels: PatientAssignedFunnel[];
  onStart: (funnel: PatientAssignedFunnel) => void;
  startingFunnelId: string | number | null;
  onViewForm: (form: PatientFunnelFormSummary) => void;
  onDownloadForm: (form: PatientFunnelFormSummary) => void;
  viewLoadingId: string | number | null;
  downloadLoadingId: string | number | null;
}

const getFormName = (form: PatientFunnelFormSummary): string =>
  form?.form_title || form?.form_name || form?.title || form?.name || "Untitled Form";

// Same key the pages use for per-row loading state (id → form_id → name).
const getFormKey = (form: PatientFunnelFormSummary): string | number =>
  form?.id ?? form?.form_id ?? getFormName(form);

const getFormRowKey = (form: PatientFunnelFormSummary, index: number): string | number =>
  form?.id ?? form?.form_id ?? index;

export default function PatientFunnelAccordion({
  variant,
  funnels,
  onStart,
  startingFunnelId,
  onViewForm,
  onDownloadForm,
  viewLoadingId,
  downloadLoadingId,
}: PatientFunnelAccordionProps) {
  const isDashboard = variant === "dashboard";

  const completedActions = (form: PatientFunnelFormSummary) => {
    const key = getFormKey(form);
    return (
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          disabled={viewLoadingId === key}
          onClick={() => onViewForm(form)}
          aria-label={`Preview ${getFormName(form)}`}
        >
          {viewLoadingId === key ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={downloadLoadingId === key}
          onClick={() => onDownloadForm(form)}
          aria-label={`Download ${getFormName(form)}`}
        >
          {downloadLoadingId === key ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Download className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>
    );
  };

  const renderFormsList = (funnel: PatientAssignedFunnel) => {
    const forms = funnel.forms || [];

    if (funnel.formsError) {
      return (
        <div className="p-4 text-sm text-muted-foreground bg-secondary/30 rounded-xl border border-border">
          {funnel.formsError}
        </div>
      );
    }
    if (forms.length === 0) {
      return (
        <div className="p-4 text-sm text-muted-foreground bg-secondary/30 rounded-xl border border-border">
          No forms available
        </div>
      );
    }

    return forms.map((form, index) => {
      const completed = isFunnelFormCompleted(form);
      return (
        <div
          key={getFormRowKey(form, index)}
          className={`flex items-center justify-between gap-4 p-3 sm:p-4 bg-secondary/30 rounded-xl border border-border ${completed ? "opacity-75" : ""}`}
        >
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className={`p-2 rounded-lg shrink-0 ${completed ? "bg-green-100" : "bg-yellow-100"}`}>
              {completed ? (
                <CheckCircle2 className="h-5 w-5 text-green-700" />
              ) : (
                <PenTool className="h-5 w-5 text-yellow-700" />
              )}
            </div>
            <h4 className={`font-medium truncate ${completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {getFormName(form)}
            </h4>
          </div>
          {completed && completedActions(form)}
        </div>
      );
    });
  };

  return (
    <Accordion type="multiple" className="space-y-3">
      {funnels.map((funnel) => {
        const progress = computeFunnelProgress(funnel.forms || []);
        const ctaLabel = getFunnelCtaLabel(progress);
        const hasFunnelId =
          funnel.funnelId !== undefined && funnel.funnelId !== null && funnel.funnelId !== "";
        const isStarting = startingFunnelId === funnel.funnelId;
        const ctaDisabled = progress.allCompleted || isStarting || progress.total === 0 || !hasFunnelId;
        const isComplete = progress.pending === 0 && progress.total > 0;

        // Status accent for the item's left border.
        const accentClass = isComplete
          ? "border-l-green-500"
          : isDashboard
            ? "border-l-red-700"
            : "border-l-yellow-500";

        return (
          <AccordionItem
            key={String(funnel.funnelId)}
            value={String(funnel.funnelId)}
            className={`border border-border border-l-4 ${accentClass} rounded-xl bg-card shadow-soft overflow-hidden data-[state=open]:shadow-md transition-shadow`}
          >
            {/* Header row: trigger (name + progress) and CTA are siblings so the
                CTA button is never nested inside the trigger button. */}
            <div className="flex items-center gap-3 sm:gap-4 pl-4 pr-3 sm:pr-4">
              <AccordionTrigger className="flex-1 min-w-0 py-3.5 items-center hover:no-underline [&>svg]:ml-2 [&>svg]:shrink-0">
                <div className="flex flex-col gap-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className={`h-4 w-4 shrink-0 ${isComplete ? "text-green-600" : isDashboard ? "text-red-700" : "text-primary"}`} />
                    <span className="font-semibold text-foreground truncate">{funnel.funnelName}</span>
                    <Badge
                      variant="outline"
                      className={
                        isComplete
                          ? "bg-green-50 text-green-700 border-green-200 shrink-0"
                          : "bg-yellow-50 text-yellow-700 border-yellow-200 shrink-0"
                      }
                    >
                      {isComplete ? "All Complete" : `${progress.pending} Pending`}
                    </Badge>
                  </div>
                  {progress.total > 0 && (
                    <div className="flex items-center gap-3 min-w-0">
                      <Progress
                        value={progress.progress}
                        className="h-1.5 flex-1 min-w-[80px] max-w-[280px] bg-secondary"
                        indicatorClassName={isComplete ? "bg-green-600" : isDashboard ? "bg-red-700" : "bg-primary"}
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap font-normal shrink-0">
                        {progress.completed} of {progress.total} completed
                      </span>
                    </div>
                  )}
                </div>
              </AccordionTrigger>
              <Button
                size="sm"
                className={`shrink-0 min-w-[7rem] whitespace-nowrap ${isDashboard ? "bg-red-700 hover:bg-red-800 text-white" : "bg-primary hover:bg-primary/90"}`}
                disabled={ctaDisabled}
                onClick={() => onStart(funnel)}
              >
                {isStarting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                {ctaLabel}
              </Button>
            </div>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-3 max-h-[360px] overflow-y-auto scroll-smooth pr-1 upcoming-visit-forms-scrollbar">
                {renderFormsList(funnel)}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
