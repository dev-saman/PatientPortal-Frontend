import { X, Clock } from "lucide-react";
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
  /** Modal heading. Defaults to the booking-flow wording. */
  title?: string;
  /** Body message. Defaults to the booking-flow wording. */
  message?: string;
}

const DEFAULT_TITLE = "Cannot Book This Time Slot";
const DEFAULT_MESSAGE =
  "Appointments can only be booked for time slots that are at least 24 hours away. Please choose a later time slot.";

/**
 * Shown when a patient tries to select a time slot that is less than 24 hours away.
 * The 24-hour minimum lead time is a backend business rule (enforced on submit via
 * appointment-schedule validation); this modal only surfaces immediate UX feedback
 * so the patient does not pick an invalid slot. `title`/`message` are overridable so
 * the same modal can serve the reschedule flow (which shows different wording).
 */
export default function BookingTooSoonModal({
  open,
  onClose,
  title = DEFAULT_TITLE,
  message = DEFAULT_MESSAGE,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-[480px] w-[90%] p-5 gap-0"
      >
        <DialogHeader className="pb-4 border-b border-border min-h-auto">
          <div className="flex items-center justify-between w-full">
            <DialogTitle className="text-xl font-semibold">
              {title}
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
          <Clock className="h-6 w-6 shrink-0 text-amber-500 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            {message}
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
