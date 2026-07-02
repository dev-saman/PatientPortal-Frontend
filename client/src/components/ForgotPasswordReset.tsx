import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import Apis from "@/lib/Apis";
import { getApiErrorMessage } from "@/lib/apiError";
import { getEmailLinkData } from "@/lib/decodeEmailLink";
import { isPasswordValid, doPasswordsMatch } from "@/lib/passwordValidation";
import { PasswordRequirementsHint } from "@/components/ui/password-requirements-hint";

export const FORGOT_PASSWORD_TOKEN_KEY = "ahcs_forgot_token";
export const FORGOT_PASSWORD_EMAIL_KEY = "ahcs_forgot_email";

export default function ForgotPasswordReset() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState(
    () => localStorage.getItem(FORGOT_PASSWORD_EMAIL_KEY) ?? ""
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);

  const passwordValid = isPasswordValid(password);
  const shouldShowPasswordHint = passwordFocused || (passwordTouched && !passwordValid);
  const passwordsMismatch =
    confirmPasswordTouched && confirmPassword.length > 0 && !doPasswordsMatch(password, confirmPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setPasswordTouched(true);
    setConfirmPasswordTouched(true);

    if (!email.trim()) {
      toast.error("Please enter your email", {
        style: { backgroundColor: "#ef4444", color: "#ffffff" },
      });
      return;
    }

    if (!password.trim()) {
      toast.error("Please enter a password", {
        style: { backgroundColor: "#ef4444", color: "#ffffff" },
      });
      return;
    }

    if (!passwordValid) {
      return;
    }

    if (!confirmPassword.trim()) {
      toast.error("Please confirm your password", {
        style: { backgroundColor: "#ef4444", color: "#ffffff" },
      });
      return;
    }

    if (!doPasswordsMatch(password, confirmPassword)) {
      toast.error("Password is not matched with Confirm Password", {
        style: { backgroundColor: "#ef4444", color: "#ffffff" },
      });
      return;
    }

    const token = localStorage.getItem(FORGOT_PASSWORD_TOKEN_KEY) ?? "";
    if (!token) {
      toast.error("Reset token is missing. Please use the link from your email.", {
        style: { backgroundColor: "#ef4444", color: "#ffffff" },
      });
      return;
    }

    setIsLoading(true);
    try {
      const source = getEmailLinkData()?.source;
      const data = await Apis.resetPassword(email.trim(), token, password, confirmPassword, source);
      const successMessage =
        (data as any)?.message || "Password reset successfully! Please login with your new credentials.";
      localStorage.removeItem(FORGOT_PASSWORD_TOKEN_KEY);
      localStorage.removeItem(FORGOT_PASSWORD_EMAIL_KEY);
      toast.success(successMessage, {
        style: { backgroundColor: "#22c55e", color: "#ffffff" },
      });
      setLocation("/login");
    } catch (error: any) {
      const errorMessage = getApiErrorMessage(error);
      toast.error(errorMessage || "Something went wrong. Please try again.", {
        style: { backgroundColor: "#ef4444", color: "#ffffff" },
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
      <Card className="w-full max-w-md shadow-lg border-t-4 border-t-primary">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-primary">Reset Password</CardTitle>
          <CardDescription>Enter your new password to reset your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fp-email">Email</Label>
              <Input
                id="fp-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fp-password">Password</Label>
              <PasswordInput
                id="fp-password"
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
              <Label htmlFor="fp-confirmPassword">Confirm Password</Label>
              <PasswordInput
                id="fp-confirmPassword"
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
                  Resetting...
                </>
              ) : (
                "Reset Password"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
