import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/apiError";
import { isPasswordValid } from "@/lib/passwordValidation";
import { PasswordRequirementsHint } from "@/components/ui/password-requirements-hint";

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user?: any; // If provided, we are in edit mode
}

export default function UserModal({ isOpen, onClose, onSuccess, user }: UserModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    password: "",
    type: user?.type || "user"
  });
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const passwordValid = user ? true : isPasswordValid(formData.password);
  const shouldShowPasswordHint = !user && (passwordFocused || (passwordTouched && !passwordValid));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setPasswordTouched(true);
      if (!isPasswordValid(formData.password)) {
        toast({
          title: "Error",
          description: "Password does not meet the required strength policy.",
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);

    try {
      const url = user 
        ? `http://10.0.0.25:3002/api/admin/users/${user.id}`
        : "http://10.0.0.25:3002/api/admin/users";
      
      const method = user ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || "");
      }

      toast({
        title: "Success",
        description: `User ${user ? "updated" : "created"} successfully`,
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({
        title: "Error",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{user ? "Edit User" : "Add New User"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>
          {!user && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                value={formData.password}
                onChange={(e) => {
                  setFormData({ ...formData, password: e.target.value });
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
              {shouldShowPasswordHint && <PasswordRequirementsHint password={formData.password} />}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select 
              value={formData.type} 
              onValueChange={(value) => setFormData({ ...formData, type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Patient</SelectItem>
                <SelectItem value="company_admin">Company Admin</SelectItem>
                <SelectItem value="admin">System Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
