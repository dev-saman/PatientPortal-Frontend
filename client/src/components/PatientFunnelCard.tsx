import { CheckCircle2, PenTool, Eye, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PatientAssignedFunnel,
  PatientFunnelFormSummary,
  computeFunnelProgress,
  getFunnelCtaLabel,
  isFunnelFormCompleted,
} from "@/lib/patientFunnels";

/**
 * Reusable funnel card used by the Dashboard and Documents multi-funnel grids.
 *
 * Each card renders ONE funnel's own name, progress, counts, Start/Resume button
 * and forms list — never combining forms across funnels. Two variants match the
 * two pages' existing single-funnel presentation:
 *  - "dashboard": the compact gray box (red accent) shown in the Upcoming Visit area.
 *  - "documents": the Action Required card (left-border accent + pending badge).
 *
 * The parent owns navigation, preview and download handlers plus their loading
 * ids, so behavior is identical to the current single-funnel implementation.
 */
export interface PatientFunnelCardProps {
  variant: "dashboard" | "documents";
  funnel: PatientAssignedFunnel;
  onStart: (funnel: PatientAssignedFunnel) => void;
  isStarting: boolean;
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

export default function PatientFunnelCard({
  variant,
  funnel,
  onStart,
  isStarting,
  onViewForm,
  onDownloadForm,
  viewLoadingId,
  downloadLoadingId,
}: PatientFunnelCardProps) {
  const forms = funnel.forms || [];
  const progress = computeFunnelProgress(forms);
  const ctaLabel = getFunnelCtaLabel(progress);
  const hasFunnelId =
    funnel.funnelId !== undefined && funnel.funnelId !== null && funnel.funnelId !== "";
  const ctaDisabled = progress.allCompleted || isStarting || progress.total === 0 || !hasFunnelId;

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

  if (variant === "dashboard") {
    return (
      <div className="flex h-full flex-col bg-gray-50 p-4 rounded-xl border border-gray-100">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="font-medium text-gray-700 truncate">{funnel.funnelName}</div>
            <div className="flex items-center gap-3">
              <Progress value={progress.progress} className="h-2 flex-1 bg-gray-200" indicatorClassName="bg-red-700" />
              <span className="text-sm text-gray-500 whitespace-nowrap">
                {progress.completed} of {progress.total} completed
              </span>
            </div>
          </div>
          <Button
            className="bg-red-700 hover:bg-red-800 text-white shrink-0"
            disabled={ctaDisabled}
            onClick={() => onStart(funnel)}
          >
            {isStarting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {ctaLabel}
          </Button>
        </div>
        <div
          className={`space-y-3 ${forms.length > 3 ? "max-h-[132px] overflow-y-auto pr-1 upcoming-visit-forms-scrollbar" : ""}`}
        >
          {funnel.formsError ? (
            <div className="flex items-center gap-3 text-sm">
              <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
              <span className="text-gray-500">{funnel.formsError}</span>
            </div>
          ) : forms.length === 0 ? (
            <div className="flex items-center gap-3 text-sm">
              <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
              <span className="text-gray-900 font-medium">No forms available</span>
            </div>
          ) : (
            forms.map((form, index) => {
              const completed = isFunnelFormCompleted(form);
              return (
                <div key={getFormRowKey(form, index)} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    {completed ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                    )}
                    <span className={completed ? "text-gray-600 line-through" : "text-gray-900 font-medium"}>
                      {getFormName(form)}
                    </span>
                  </div>
                  {completed && completedActions(form)}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // variant === "documents"
  const borderClass = progress.pending === 0 ? "border-l-green-500" : "border-l-yellow-500";
  return (
    <Card className={`flex h-full flex-col shadow-soft border-l-4 ${borderClass}`}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold leading-none truncate">{funnel.funnelName}</h3>
          <Badge
            variant="outline"
            className={
              progress.pending === 0
                ? "bg-green-50 text-green-700 border-green-200 shrink-0"
                : "bg-yellow-50 text-yellow-700 border-yellow-200 shrink-0"
            }
          >
            {progress.pending === 0 ? "All Complete" : `${progress.pending} Pending`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            {progress.total > 0 ? (
              <div className="flex items-center gap-3">
                <Progress value={progress.progress} className="h-2 flex-1 bg-secondary" indicatorClassName="bg-primary" />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {progress.completed} of {progress.total} completed
                </span>
              </div>
            ) : null}
          </div>
          <Button
            className="bg-primary hover:bg-primary/90 shrink-0"
            disabled={ctaDisabled}
            onClick={() => onStart(funnel)}
          >
            {isStarting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {ctaLabel}
          </Button>
        </div>
        <div className="space-y-4 max-h-[400px] overflow-y-auto scroll-smooth pr-1 upcoming-visit-forms-scrollbar">
          {funnel.formsError ? (
            <div className="p-4 text-sm text-muted-foreground bg-secondary/30 rounded-xl border border-border">
              {funnel.formsError}
            </div>
          ) : forms.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground bg-secondary/30 rounded-xl border border-border">
              No forms available
            </div>
          ) : (
            forms.map((form, index) => {
              const completed = isFunnelFormCompleted(form);
              return (
                <div
                  key={getFormRowKey(form, index)}
                  className={`flex items-center justify-between gap-4 p-4 bg-secondary/30 rounded-xl border border-border ${completed ? "opacity-75" : ""}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${completed ? "bg-green-100" : "bg-yellow-100"}`}>
                      {completed ? (
                        <CheckCircle2 className="h-5 w-5 text-green-700" />
                      ) : (
                        <PenTool className="h-5 w-5 text-yellow-700" />
                      )}
                    </div>
                    <div>
                      <h3 className={`font-semibold ${completed ? "line-through text-muted-foreground" : ""}`}>
                        {getFormName(form)}
                      </h3>
                    </div>
                  </div>
                  {completed && completedActions(form)}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
