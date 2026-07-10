import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { 
  LayoutDashboard, 
  Calendar, 
  MessageSquare, 
  FileText, 
  CreditCard, 
  User, 
  Menu, 
  X, 
  LogOut,
  Activity,
  Bell,
  Search,
  ShieldCheck,
  BookOpen,
  Users,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import Apis from "@/lib/Apis";
import { useQueryClient } from "@tanstack/react-query";
import { ensureCaseContext, applyCaseContext, CASE_CONTEXT_CHANGED_EVENT } from "@/lib/caseContext";
import { useToast } from "@/hooks/use-toast";
import { resolveCurrentCaseFunnelId } from "@/lib/funnels";
import { SelectedCaseContext } from "@/contexts/SelectedCaseContext";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, isAuthenticated, refreshUserDetails } = useAuth();
  const [caseIds, setCaseIds] = useState<any[]>([]);
  const [caseIdsFetchDone, setCaseIdsFetchDone] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState(localStorage.getItem("ahcs_selected_case_id") || "");
  const [contentRefreshKey, setContentRefreshKey] = useState(0);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const getCaseIdValue = (caseItem: any): string => {
    if (typeof caseItem === "string" || typeof caseItem === "number") {
      return String(caseItem);
    }
    return String(caseItem?.case_id || caseItem?.id || caseItem || "");
  };

  useEffect(() => {
    if (!isAuthenticated || !user?.email) return;

    const fetchCaseIds = async () => {
      try {
        const response = await Apis.getCaseIdsByEmail(user.email);
        const data = response?.data?.case_ids || response?.case_ids || response?.data?.data || response?.data || response || [];
        if (Array.isArray(data)) {
          setCaseIds(data);
        }
      } catch (error) {
        console.error("Failed to fetch case IDs:", error);
      } finally {
        setCaseIdsFetchDone(true);
      }
    };
    fetchCaseIds();
  }, [isAuthenticated, user?.email]);

  useEffect(() => {
    if (!caseIdsFetchDone) return;

    if (!caseIds.length) {
      toast({
        title: "No Case Found",
        description: "No case IDs are associated with your account. Please contact support.",
        variant: "destructive",
      });
      return;
    }

    const allCaseIdValues = caseIds.map(getCaseIdValue);
    // Always re-read localStorage here so we pick up any case switch that
    // happened before Layout mounted (e.g. EmailLinkHandler switched case
    // while showing the loading spinner before navigating to the form page).
    const storedCaseId = localStorage.getItem("ahcs_selected_case_id") || "";

    // If there's already a valid stored selection, sync the UI state and call
    // refreshUserDetails so getPatientDetails fires with case_id=storedCaseId.
    // This is the primary path for funnel-URL logins: the case_id was stored
    // in localStorage during login, the dropdown now reflects it, and this
    // call ensures patient details also load for the same case.
    if (storedCaseId && allCaseIdValues.includes(storedCaseId)) {
      setSelectedCaseId(storedCaseId);
      refreshUserDetails().catch(() => {});
      return;
    }

    // The stored case_id is set but not present in the returned list (e.g. it
    // came from a funnel URL and the getCaseIdsByEmail API didn't include it).
    // Keep the stored selection — don't silently swap to a different case.
    // The backend will validate access; the frontend should not override a case
    // that was explicitly set from the URL.
    // Still call refreshUserDetails so patient details load for the URL case.
    if (storedCaseId) {
      setSelectedCaseId(storedCaseId);
      refreshUserDetails().catch(() => {});
      return;
    }

    // No stored selection at all — auto-select the first case ID from the API
    // response. Write directly to localStorage and update state without firing
    // CASE_CONTEXT_CHANGED_EVENT. Firing the event would increment
    // contentRefreshKey and unmount/remount the entire content area, causing a
    // visible flicker on first load. The context update here is enough to
    // propagate the new case ID to PatientDashboard via SelectedCaseContext.
    const firstCaseId = getCaseIdValue(caseIds[0]);
    if (!firstCaseId) return;

    localStorage.setItem("ahcs_selected_case_id", firstCaseId);
    setSelectedCaseId(firstCaseId);
    refreshUserDetails().catch(() => {});
  }, [caseIds, caseIdsFetchDone]);

  // Keep a ref of the latest selected case id for the cross-tab storage listener.
  const selectedCaseIdRef = useRef(selectedCaseId);
  useEffect(() => {
    selectedCaseIdRef.current = selectedCaseId;
  }, [selectedCaseId]);

  // Sync the selected case id across browser tabs. When another tab changes the
  // case, update the selector here and refresh queries + remount the page content
  // so every page refetches its data with the newly selected case id.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "ahcs_selected_case_id") return;

      const newCaseId = event.newValue || "";
      if (newCaseId === selectedCaseIdRef.current) return;

      selectedCaseIdRef.current = newCaseId;
      setSelectedCaseId(newCaseId);
      queryClient.invalidateQueries();
      setContentRefreshKey((previousKey) => previousKey + 1);
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [queryClient]);

  // Sync the selected case id within the same tab. Fired by applyCaseContext()
  // when a funnel URL carries a different case_id than the currently active one
  // (e.g. the EmailLinkHandler switches case before navigating to the form).
  useEffect(() => {
    const handleCaseContextChanged = (event: Event) => {
      const newCaseId = (event as CustomEvent<{ caseId: string }>).detail?.caseId || "";
      if (!newCaseId || newCaseId === selectedCaseIdRef.current) return;

      selectedCaseIdRef.current = newCaseId;
      setSelectedCaseId(newCaseId);
      queryClient.invalidateQueries();
      setContentRefreshKey((previousKey) => previousKey + 1);
      refreshUserDetails().catch(() => {});
    };

    window.addEventListener(CASE_CONTEXT_CHANGED_EVENT, handleCaseContextChanged);
    return () => window.removeEventListener(CASE_CONTEXT_CHANGED_EVENT, handleCaseContextChanged);
  }, [queryClient]);

  const navItems: { name: string; path: string; icon: typeof LayoutDashboard; badge?: number }[] = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    { name: "Appointments", path: "/appointments", icon: Calendar },
    // { name: "Messages", path: "/messages", icon: MessageSquare, badge: 2 },
    // { name: "My Health", path: "/health", icon: Activity },
    // { name: "Billing", path: "/billing", icon: CreditCard },
    // { name: "Learning Center", path: "/learning", icon: BookOpen },
    { name: "Documents", path: "/documents", icon: FileText },
    { name: "Profile", path: "/profile", icon: User },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-card border-r border-border transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Button 
          variant="ghost" 
          size="icon" 
          className="lg:hidden absolute top-0 right-0 z-10"
          onClick={() => setSidebarOpen(false)}
        >
          <X className="h-5 w-5" />
        </Button>
        <div className="p-6 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
              A
            </div>
            <span className="font-heading font-bold text-xl tracking-tight text-foreground">
              Advantage<span className="text-primary">HCS</span>
            </span>
          </div>
        </div>

        {/* <div className="px-4 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search..." 
              className="w-full bg-secondary/50 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div> */}

        <div className="px-4 py-2">
          <div className="flex items-center gap-1.5 w-full">
            <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
              Case Id:
            </p>
            <div className="relative flex-1 min-w-0">
            <select
              value={selectedCaseId}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedCaseId(value);
                if (value) {
                  localStorage.setItem("ahcs_selected_case_id", value);
                  ensureCaseContext(value)
                    .then(async () => {
                      queryClient.invalidateQueries();
                      refreshUserDetails().catch(() => {});

                      // When switching case while viewing a form, fetch the new
                      // case's funnel list BEFORE any navigation or remount so we
                      // never attempt to validate the old funnel id against the new
                      // case. Navigate directly to the resolved funnel page (or
                      // /documents as fallback) without remounting the old route.
                      if (location.startsWith("/form/")) {
                        try {
                          const newFunnelId = await resolveCurrentCaseFunnelId();
                          setLocation(newFunnelId ? `/form/${encodeURIComponent(newFunnelId)}` : "/documents");
                        } catch {
                          setLocation("/documents");
                        }
                        
                        // Force a remount so the form page refetches even when the newly
                        // selected case resolves to the SAME funnel id (two cases can
                        // share one funnel, e.g. both use /form/33). Without this the
                        // setLocation above is a no-op, the funnel id in the route never
                        // changes, and get-patient-funnel-submission-details never
                        // refetches for the new case_id — leaving the completion status
                        // stale. Remounting reruns the fetch with the new case_id.
                        setContentRefreshKey((previousKey) => previousKey + 1);
                        return;
                      }

                      setContentRefreshKey((previousKey) => previousKey + 1);
                    })
                    .catch((error) => {
                      console.error("Failed to change case ID:", error);
                    });
                } else {
                  localStorage.removeItem("ahcs_selected_case_id");
                }
              }}
              className="w-full bg-white rounded-sm px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all border border-[#972527] appearance-none cursor-pointer"
            >
              {caseIds.map((caseItem, index) => (
                <option
                  key={typeof caseItem === 'string' || typeof caseItem === 'number' ? caseItem : (caseItem?.id || index)}
                  value={getCaseIdValue(caseItem)}
                  className="cursor-pointer"
                >
                  {getCaseIdValue(caseItem)}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.path;
            return (
              <Link key={item.path} href={item.path}>
                <button
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group text-left",
                    isActive 
                      ? "bg-primary/10 text-primary shadow-sm" 
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className={cn(
                    "h-5 w-5 transition-colors shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )} />
                  <span className="flex-1">{item.name}</span>
                  {item.badge && (
                    <Badge variant="destructive" className="h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px] shrink-0">
                      {item.badge}
                    </Badge>
                  )}
                </button>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          {/* Proxy Switcher */}
          {/* <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="bg-secondary/50 rounded-xl p-4 mb-4 cursor-pointer hover:bg-secondary transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Viewing As</span>
                  </div>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user?.avatar} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {user?.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-sm truncate">{user?.name}</span>
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Switch Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="bg-primary/5">
                <User className="mr-2 h-4 w-4" />
                <span>{user?.name} (Me)</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Users className="mr-2 h-4 w-4" />
                <span>Michael Jenkins (Spouse)</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Users className="mr-2 h-4 w-4" />
                <span>Lily Jenkins (Child)</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu> */}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-secondary transition-colors text-left">
                <Avatar className="h-9 w-9 border border-border">
                  <AvatarImage src={user?.avatar} />
                  <AvatarFallback className="text-xs">
                    {user?.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user?.name}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLocation("/profile?tab=general")}>Profile Settings</DropdownMenuItem>
              {/* HIDDEN: Notifications and Security menu items hidden per UI requirements
              <DropdownMenuItem onClick={() => setLocation("/profile?tab=notifications")}>Notifications</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/profile?tab=security")}>Security</DropdownMenuItem>
              */}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden h-16 border-b border-border bg-card flex items-center justify-between px-4 sticky top-0 z-30">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-6 w-6" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
                A
              </div>
              <span className="font-heading font-bold text-lg">AdvantageHCS</span>
            </div>
          </div>
          {/* Notification bell — hidden for now; uncomment to restore
          <div className="flex items-center">
            <Button variant="ghost" size="icon">
              <Bell className="h-5 w-5" />
            </Button>
          </div>
          */}
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-background/50 p-4 md:p-8">
          <SelectedCaseContext.Provider value={useMemo(() => ({ selectedCaseId, caseIdsFetchDone }), [selectedCaseId, caseIdsFetchDone])}>
            <div key={contentRefreshKey} className="container max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
              {children}
            </div>
          </SelectedCaseContext.Provider>
        </main>
      </div>
    </div>
  );
}
