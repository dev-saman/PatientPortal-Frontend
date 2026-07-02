import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import axiosInstance from "@/lib/api";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  getEmailLinkData,
  clearEmailLinkData,
  DecodedEmailLinkData,
} from "@/lib/decodeEmailLink";
import { isPasswordValid, doPasswordsMatch } from "@/lib/passwordValidation";
import { PasswordRequirementsHint } from "@/components/ui/password-requirements-hint";
import ForgotPasswordReset, {
  FORGOT_PASSWORD_TOKEN_KEY,
  FORGOT_PASSWORD_EMAIL_KEY,
} from "@/components/ForgotPasswordReset";

function isForgotPasswordSession(): boolean {
  // Check URL params first
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  const urlEmail = params.get("email");
  if (urlToken && urlEmail) {
    // Persist to localStorage so refresh still works
    localStorage.setItem(FORGOT_PASSWORD_TOKEN_KEY, urlToken);
    localStorage.setItem(FORGOT_PASSWORD_EMAIL_KEY, decodeURIComponent(urlEmail));
    return true;
  }
  // Fall back to localStorage (covers page refresh)
  return !!(
    localStorage.getItem(FORGOT_PASSWORD_TOKEN_KEY) &&
    localStorage.getItem(FORGOT_PASSWORD_EMAIL_KEY)
  );
}

export default function ResetPassword() {
  const [isForgotFlow] = useState(() => isForgotPasswordSession());
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [linkData, setLinkData] = useState<DecodedEmailLinkData | null>(null);
  const [isValidSession, setIsValidSession] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);

  // Check for valid Magic Link session data on mount (skipped when forgot-password flow)
  useEffect(() => {
    if (isForgotFlow) return;
    const data = getEmailLinkData();
    if (!data) {
      // No valid session data - redirect to login
      toast.error("Invalid or expired link. Please use the link from your email.", {
        style: { backgroundColor: "#ef4444", color: "#ffffff" },
      });
      setLocation("/login");
      return;
    }
    setLinkData(data);
    setEmail(data.email ?? "");
    setIsValidSession(true);
  }, [isForgotFlow, setLocation]);

  // Render the Forgot Password reset flow when token + email are present
  if (isForgotFlow) {
    return <ForgotPasswordReset />;
  }

  const passwordValid = isPasswordValid(password);
  const shouldShowPasswordHint = passwordFocused || (passwordTouched && !passwordValid);
  const passwordsMismatch =
    confirmPasswordTouched && confirmPassword.length > 0 && !doPasswordsMatch(password, confirmPassword);
  const isSmsSource = linkData?.source?.toLowerCase() === "sms";
  const isNoUserFlag = linkData?.flag?.toLowerCase() === "no_user";
  const requiresEmailInput = isSmsSource && isNoUserFlag && !linkData?.email?.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setPasswordTouched(true);

    // Validate password is not empty
    if (!password.trim()) {
      toast.error("Please enter a password", {
        style: { backgroundColor: "#ef4444", color: "#ffffff" },
      });
      return;
    }

    // Validate password strength requirements
    if (!passwordValid) {
      return;
    }

    setConfirmPasswordTouched(true);

    // Validate passwords match
    if (!doPasswordsMatch(password, confirmPassword)) {
      toast.error("Password is not matched with Confirm Password", {
        style: { backgroundColor: "#ef4444", color: "#ffffff" },
      });
      return;
    }

    if (!linkData) return;

    if (requiresEmailInput && !email.trim()) {
      toast.error("Please enter an email", {
        style: { backgroundColor: "#ef4444", color: "#ffffff" },
      });
      return;
    }

    setIsLoading(true);

    try {
      // Build FormData for the API call
      const formData = new FormData();
      formData.append("patient_id", linkData.patient_id);
      formData.append("case_id", linkData.case_id);
      formData.append("funnel_id", linkData.form); // "form" maps to "funnel_id"
      formData.append("name", linkData.name);
      formData.append("email", requiresEmailInput ? email.trim() : linkData.email);
      formData.append("password", password);
      formData.append("confirm_password", confirmPassword);
      formData.append("phone", linkData.phone);
      if (linkData.source) formData.append("source", linkData.source);

      const response = await axiosInstance.post("/add-patient-to-funnel", formData);

      if (response.data) {
        // Success - clear session data and set password reset flow flag
        clearEmailLinkData();
        sessionStorage.setItem("ahcs_password_reset_flow", "true");
        if (isSmsSource && isNoUserFlag) {
          sessionStorage.setItem("ahcs_sms_no_user_form_redirect", linkData.form);
        }
        toast.success("Password created successfully! Please login with your new credentials.", {
          style: { backgroundColor: "#22c55e", color: "#ffffff" },
        });
        setLocation("/login");
      }
    } catch (error: any) {
      const errorMessage = getApiErrorMessage(error);
      toast.error(errorMessage, {
        style: { backgroundColor: "#ef4444", color: "#ffffff" },
      });

      // If user already exists, redirect to login after 2 seconds
      if (errorMessage === "User already exists.") {
        setTimeout(() => {
          clearEmailLinkData();
          setLocation("/login");
        }, 2000);
        return; // Keep isLoading true to prevent further submissions
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Don't render until session is validated
  if (!isValidSession) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
      <Card className="w-full max-w-md shadow-lg border-t-4 border-t-primary">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-primary">Create Password</CardTitle>
          <CardDescription>
            Set up your secure account password
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {requiresEmailInput && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordTouched(true);
                }}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => {
                  setPasswordTouched(true);
                  setPasswordFocused(false);
                }}
                aria-invalid={passwordTouched && !passwordValid}
                className={
                  passwordTouched && !passwordValid ? "border-red-500 focus-visible:ring-red-500" : undefined
                }
                required
              />
              {shouldShowPasswordHint && <PasswordRequirementsHint password={password} />}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <PasswordInput
                id="confirmPassword"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setConfirmPasswordTouched(true)}
                aria-invalid={passwordsMismatch}
                className={passwordsMismatch ? "border-red-500 focus-visible:ring-red-500" : undefined}
                required
              />
              {passwordsMismatch && (
                <p className="text-xs text-red-500">Passwords do not match.</p>
              )}
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90" type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
