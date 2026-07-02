import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Apis from "@/lib/Apis";
import { getApiErrorMessage } from "@/lib/apiError";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast({
        description: "Please enter your email address first.",
        variant: "destructive",
      });
      return;
    }

    setIsForgotLoading(true);
    try {
      const data = await Apis.forgotPassword(email.trim());
      toast({
        description: data?.message || "Password reset email sent.",
        variant: "success",
      });
    } catch (error: any) {
      toast({
        description: getApiErrorMessage(error) || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsForgotLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await login(email, password);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
      <Card className="w-full max-w-md shadow-lg border-t-4 border-t-primary">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-primary">AdvantageHCS</CardTitle>
          <CardDescription>
            Secure Patient Portal Access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email or Username test</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="name@example.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isForgotLoading}
                  className="text-xs text-primary hover:text-primary/80 hover:underline focus:outline-none focus:underline disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isForgotLoading ? "Sending..." : "Forgot Password?"}
                </button>
              </div>
              <PasswordInput
                id="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
              />
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90" type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
