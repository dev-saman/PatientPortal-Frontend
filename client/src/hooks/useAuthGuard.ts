import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useEffect } from "react";

interface AuthGuardOptions {
  requiredRole?: "patient" | "staff" | "admin";
  redirectTo?: string;
}

/**
 * useAuthGuard Hook
 * Validates JWT authentication and optionally checks for specific roles
 * Automatically redirects to login if user is not authenticated
 * Clears storage on redirect
 *
 * @param options - Configuration options for auth guard
 * @returns Object with authentication status and user info
 */
export function useAuthGuard(options: AuthGuardOptions = {}) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { requiredRole, redirectTo = "/login" } = options;

  useEffect(() => {
    // Skip check while loading
    if (isLoading) return;

    // Check if user is authenticated
    if (!isAuthenticated || !user) {
      // Clear storage on redirect
      localStorage.clear();
      sessionStorage.clear();
      setLocation(redirectTo);
      return;
    }

    // Check if user has required role
    if (requiredRole && user.role !== requiredRole) {
      // User doesn't have the required role
      // Redirect to appropriate page based on user's actual role
      if (user.role === "admin") {
        setLocation("/admin");
      } else if (user.role === "staff") {
        setLocation("/staff");
      } else {
        setLocation("/");
      }
      return;
    }
  }, [isAuthenticated, isLoading, user, requiredRole, redirectTo, setLocation]);

  return {
    isAuthenticated,
    user,
    isLoading,
    hasRequiredRole: !requiredRole || (user?.role === requiredRole),
  };
}

export default useAuthGuard;
