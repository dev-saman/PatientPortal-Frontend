import { AlertTriangle, Check, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  getPasswordRequirements,
  PASSWORD_REQUIREMENT_ITEMS,
  PASSWORD_REQUIREMENTS_MESSAGE,
} from "@/lib/passwordValidation";

interface PasswordRequirementsHintProps {
  password: string;
  className?: string;
}

export function PasswordRequirementsHint({ password, className }: PasswordRequirementsHintProps) {
  const requirements = getPasswordRequirements(password);

  return (
    <div
      role="tooltip"
      className={cn(
        "relative mt-2 rounded-sm border border-border bg-white px-3 py-2 text-xs text-foreground shadow-md",
        className
      )}
    >
      <div className="absolute -top-2 left-4 h-3 w-3 rotate-45 border-l border-t border-border bg-white" />
      <div className="relative space-y-2">
        <div className="flex gap-2">
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-amber-500 text-white">
            <AlertTriangle className="h-3.5 w-3.5" />
          </div>
          <p className="font-medium">{PASSWORD_REQUIREMENTS_MESSAGE}</p>
        </div>
        <ul className="space-y-1 pl-7">
          {PASSWORD_REQUIREMENT_ITEMS.map(({ key, label }) => {
            const met = requirements[key];
            return (
              <li
                key={key}
                className={cn(
                  "flex items-center gap-1.5",
                  met ? "text-green-600" : "text-muted-foreground"
                )}
              >
                {met ? (
                  <Check className="h-3 w-3 shrink-0" />
                ) : (
                  <X className="h-3 w-3 shrink-0" />
                )}
                {label}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
