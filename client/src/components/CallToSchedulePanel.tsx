import { Phone, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface CallToSchedulePanelProps {
  /**
   * `facility_phone_no` from the backend — already formatted, e.g. "(214) 941-4550".
   * Rendered verbatim. When absent the number line is omitted entirely; we never
   * substitute a hardcoded number.
   */
  phone?: string | null;
  /**
   * Facility/location name, prefixed to the number as "{location}: {phone}".
   * Omitted from the line when absent — the number still renders on its own.
   */
  location?: string | null;
  /** Heading text. Override per-flow if the wording needs to differ. */
  title?: string;
  className?: string;
}

/**
 * Shown in place of the time-slot picker when the backend reports
 * `allow_visit_type = 0` for the preauth/appointment — the visit type cannot be
 * booked from the portal and the patient has to phone the facility.
 *
 * Used by both the "Schedule Your Remaining Appointments" modal and the Reschedule
 * modal, so the message and styling stay identical across the two flows.
 */
export function CallToSchedulePanel({
  phone,
  location,
  title = "Please Call to Schedule",
  className,
}: CallToSchedulePanelProps) {
  // Digits only for the dial link; the visible label keeps the backend's formatting.
  const dialHref = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : undefined;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-primary/30 bg-card px-6 py-10 text-center",
        className,
      )}
    >
      <Phone className="h-8 w-8 flex-shrink-0 text-primary" />
      <h3 className="mt-4 font-heading text-2xl font-bold tracking-tight text-foreground">
        {title}
      </h3>
      {phone && (
        <p className="mt-2 text-lg font-semibold text-primary">
          {location ? `${location}: ` : ""}
          <a href={dialHref} className="hover:underline">
            {phone}
          </a>
        </p>
      )}
      <p className="mt-3 max-w-sm text-sm text-muted-foreground leading-relaxed">
        Our scheduling team will help you find the right appointment time.
      </p>
    </div>
  );
}

/**
 * Sidebar counterpart to {@link CallToSchedulePanel}, replacing the "Your appointments"
 * panel in the schedule modal so the two-column layout keeps its shape when there is
 * nothing to select.
 */
export function SchedulingAssistanceCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-full lg:w-72 flex-shrink-0 rounded-lg border border-emerald-200 bg-emerald-50/40 overflow-hidden flex flex-col",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-200 bg-emerald-50">
        <CalendarCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
        <div className="text-sm font-semibold text-emerald-700 leading-tight">
          Scheduling assistance
        </div>
      </div>
      <div className="p-4 flex-1">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Call your location to schedule this appointment.
        </p>
      </div>
    </div>
  );
}
