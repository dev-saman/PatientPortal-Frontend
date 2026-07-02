import { Loader2 } from "lucide-react";

/**
 * LoadingSpinner – full-screen loader used during authentication checks
 * (before the Layout shell is mounted). Matches PageLoader's spinner style
 * so the visual is consistent whether the layout is present or not.
 */
export default function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
