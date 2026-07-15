import { useState, useEffect } from "react";
import { X, AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Apis from "@/lib/Apis";
import { getApiErrorMessage } from "@/lib/apiError";
import type { PreauthRecord } from "@/components/SelectPreauthorizationModal";

interface Props {
  open: boolean;
  onClose: () => void;
  preauth: PreauthRecord | null;
  /** Called after an activation request is successfully submitted, so the caller
   *  can refetch the preauth list (the record's `sent_request` flips to true). */
  onSubmitted?: () => void;
}

/**
 * Shown when a patient tries to schedule against a preauthorization that the API
 * reports is not yet ready (missing required details). Lets the patient submit an
 * activation request to the support team. All readiness/validation logic lives in
 * the backend — this modal only collects the request and reports the result.
 *
 * When the backend already reports `sent_request` for this preauth, the modal
 * renders read-only in an "Under Review" state instead: the request is pending
 * approval, so there is nothing to submit and scheduling stays blocked.
 */
export default function ActivationRequiredModal({ open, onClose, preauth, onSubmitted }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // A request is already pending approval (backend flag). The just-submitted view
  // takes precedence, since `preauth` is still the pre-submit record.
  const underReview = !submitted && preauth?.sent_request === true;

  // Reset to the initial prompt view whenever the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setSubmitting(false);
      setSubmitted(false);
    }
  }, [open]);

  const handleSendRequest = async () => {
    if (!preauth) return;
    setSubmitting(true);
    try {
      await Apis.notifyPatientPreauthMissingDetails(preauth.case_id, preauth.ma_id);
      setSubmitted(true);
      onSubmitted?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-[520px] w-[90%] p-5 gap-0"
      >
        <DialogHeader className="pb-4 border-b border-border min-h-auto">
          <div className="flex items-center justify-between w-full">
            <DialogTitle className="text-xl font-semibold">
              {submitted
                ? "Request Submitted Successfully"
                : underReview
                  ? "Under Review"
                  : "Activation Required"}
            </DialogTitle>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        {submitted ? (
          <div className="py-5 flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-green-500 mt-0.5" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your activation request has been submitted successfully. Once the support
              team reviews and approves your request, you will be able to schedule
              appointments for this preauthorization. You will be notified via email and
              SMS when your request has been processed.
            </p>
          </div>
        ) : underReview ? (
          <div className="py-5 flex items-start gap-3">
            <Clock className="h-6 w-6 shrink-0 text-gray-400 mt-0.5" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your activation request for this preauthorization is under review. You will
              be able to schedule appointments once the support team approves it. You will
              be notified via email and SMS when your request has been processed.
            </p>
          </div>
        ) : (
          <div className="py-5 flex items-start gap-3">
            <AlertCircle className="h-6 w-6 shrink-0 text-red-500 mt-0.5" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              This preauthorization is not yet ready for appointment scheduling. Please
              submit an activation request so the required information can be completed
              before appointments can be booked.
            </p>
          </div>
        )}

        <div className="pt-4 border-t border-border flex justify-end gap-3">
          {submitted || underReview ? (
            <Button className="bg-primary hover:bg-primary/90" onClick={onClose}>
              {submitted ? "Done" : "Close"}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                className="bg-primary hover:bg-primary/90"
                onClick={handleSendRequest}
                disabled={submitting || !preauth}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Sending..." : "Send Request"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
