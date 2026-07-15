import { X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Human-readable continuous availability from the selected slot, e.g. "15 minutes". */
  availableLabel: string;
  /** Human-readable required appointment length, e.g. "30 minutes" / "2 hours 30 minutes". */
  requiredLabel: string;
}

/**
 * Shown when the patient picks an available slot that does not have enough
 * continuous availability to fit the required appointment length (derived from the
 * selected Specialty + Visit Type `duration_minutes`, which the backend owns). This
 * is immediate UX feedback so the patient can pick a slot with sufficient duration.
 */
export default function SlotTooShortModal({ open, onClose, availableLabel, requiredLabel }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-[480px] w-[90%] p-5 gap-0"
      >
        <DialogHeader className="pb-4 border-b border-border min-h-auto">
          <div className="flex items-center justify-between w-full">
            <DialogTitle className="text-xl font-semibold">
              Time Slot Not Long Enough
            </DialogTitle>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <div className="py-5 flex items-start gap-3">
          <AlertCircle className="h-6 w-6 shrink-0 text-amber-500 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            The available time slot is <span className="font-semibold text-foreground">{availableLabel}</span>,
            but this appointment requires <span className="font-semibold text-foreground">{requiredLabel}</span>.
            Please select another available time slot with sufficient duration.
          </p>
        </div>

        <div className="pt-4 border-t border-border flex justify-end">
          <Button className="bg-primary hover:bg-primary/90" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
