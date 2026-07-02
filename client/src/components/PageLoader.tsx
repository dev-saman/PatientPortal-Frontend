import { Loader2 } from "lucide-react";

/**
 * PageLoader – single, reusable full-content-area loading indicator.
 *
 * Use this as the early-return loader on every page that has a loading state
 * (Appointments, Documents, Dashboard, etc.) so the spinner is always in the
 * same position with the same styling across the application.
 */
export default function PageLoader() {
  return (
    <div className="flex items-center justify-center w-full min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
