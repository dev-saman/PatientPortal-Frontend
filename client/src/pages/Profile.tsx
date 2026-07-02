import { useState, useEffect, useCallback } from "react";
import PageLoader from "@/components/PageLoader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, Shield, Bell, Lock, Users, Mail, Phone, LogOut, MapPin, Edit2, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import Apis from "@/lib/Apis";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatDate } from "@/lib/utils";

interface ProxyItem {
  id: number;
  proxy_name: string;
  proxy_email: string;
  status: string;
  is_active: number;
  invited_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  last_activity: string | null;
}

interface PatientDetails {
  full_name: string;
  first_name: string;
  last_name: string;
  dob: string;
  email: string;
  home_phone: string;
  address1: string;
}

// Format phone number to (XXX) XXX-XXXX format
const formatPhone = (phoneString: string): string => {
  if (!phoneString) return "";
  // Remove all non-digit characters
  const digits = phoneString.replace(/\D/g, "");
  // Format as (XXX) XXX-XXXX
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phoneString;
};

export default function Profile() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<string>("general");

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };
  const [patientDetails, setPatientDetails] = useState<PatientDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [proxyEmail, setProxyEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [proxies, setProxies] = useState<ProxyItem[]>([]);
  const [isLoadingProxies, setIsLoadingProxies] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [selectedProxyId, setSelectedProxyId] = useState<number | null>(null);
  const [proxyHistory, setProxyHistory] = useState<Record<number, { viewed_by: string; action: string; resource_type: string; accessed_at: string; accessed_at_human: string }[]>>({});
  const [loadingHistoryId, setLoadingHistoryId] = useState<number | null>(null);
  const [notifications, setNotifications] = useState({
    email: true,
    sms: false,
    push: true,
    marketing: false
  });

  // Fetch patient details on component mount
  useEffect(() => {
    const fetchPatientDetails = async () => {
      try {
        const data = await Apis.getPatientDetails();
        
        if (data.success === false) {
          toast.error(data.message || data.error || "");
          setIsLoading(false);
          return;
        }

        // Map API response to state
        setPatientDetails({
          full_name: data.patient_details?.full_name || "",
          first_name: data.patient_details?.first_name || "",
          last_name: data.patient_details?.last_name || "",
          dob: data.patient_details?.dob || "",
          email: data.patient_details?.email || "",
          home_phone: data.patient_details?.home_phone || "",
          address1: data.patient_details?.address1 || "",
        });
      } catch (error) {
        console.error("Error fetching patient details:", error);
        toast.error(getApiErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    };

    fetchPatientDetails();
  }, []);

  // Fetch proxy list when Proxy Access tab is active
  // silent=true skips the page-level loader (used for background refreshes after invite)
  const fetchProxies = useCallback(async (silent = false) => {
    if (!silent) setIsLoadingProxies(true);
    try {
      const data = await Apis.getProxyList();
      if (data.success === false) {
        toast.error(data.message || data.error || "Failed to load proxies.");
        return;
      }
      const active = (data.proxies || []).filter(
        (p: ProxyItem) => p.status === "active" && p.is_active === 1
      );
      setProxies(active);
      if (active.length > 0) {
        const firstId = active[0].id;
        setSelectedProxyId(firstId);
        try {
          const histData = await Apis.getProxyHistory(firstId);
          if (histData.success !== false) {
            setProxyHistory({ [firstId]: histData.history || [] });
          }
        } catch {
          // silently ignore history fetch failure on initial load
        }
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsLoadingProxies(false);
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab !== "proxy") return;
    fetchProxies();
  }, [activeTab, fetchProxies]);

  const handleNotificationChange = (key: keyof typeof notifications) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
    toast.success("Notification preferences updated");
  };

  const handleProxyInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proxyEmail.trim()) {
      toast.error("Please enter an email address.");
      return;
    }
    setIsInviting(true);
    try {
      const data = await Apis.sendProxyInvite(proxyEmail.trim());
      if (data.success === false) {
        toast.error(data.message || data.error || "Failed to send invite.");
        return;
      }
      toast.success(data.message || "Proxy invitation sent successfully.");
      setProxyEmail("");
      await fetchProxies(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsInviting(false);
    }
  };

  const handleProxyClick = async (proxyId: number) => {
    if (selectedProxyId === proxyId) {
      setSelectedProxyId(null);
      return;
    }
    setSelectedProxyId(proxyId);
    if (proxyHistory[proxyId]) return;
    setLoadingHistoryId(proxyId);
    try {
      const data = await Apis.getProxyHistory(proxyId);
      if (data.success === false) {
        toast.error(data.message || data.error || "Failed to load access history.");
        return;
      }
      setProxyHistory((prev) => ({ ...prev, [proxyId]: data.history || [] }));
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setLoadingHistoryId(null);
    }
  };

  const handleRevokeProxy = async (proxyId: number) => {
    setRevokingId(proxyId);
    try {
      const data = await Apis.revokeProxy(proxyId);
      if (data.success === false) {
        toast.error(data.message || data.error || "Failed to revoke proxy.");
        return;
      }
      toast.success(data.message || "Proxy access revoked successfully.");
      setProxies((prev) => prev.filter((p) => p.id !== proxyId));
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setRevokingId(null);
    }
  };

  // Show full-page loader only during initial page load (patient details fetch)
  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Profile & Settings</h1>
          <p className="text-muted-foreground">Manage your account, security, and preferences.</p>
        </div>
        <Button variant="destructive" onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-[300px_1fr]">
        <Card className="h-fit shadow-soft">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Avatar className="h-24 w-24 border-4 border-primary/10">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                  {user?.name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
            </div>
            <CardTitle>{patientDetails?.full_name || ""}</CardTitle>
            <CardDescription>{patientDetails?.email || ""}</CardDescription>
            <div className="mt-2">
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                Patient Account
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">MRN</Label>
              <div className="font-medium">--</div>
            </div> */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Date of Birth</Label>
              <div className="font-medium">{formatDate(patientDetails?.dob || "") || "N/A"}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Phone</Label>
              <div className="font-medium">{formatPhone(patientDetails?.home_phone || "") || "N/A"}</div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="general">General</TabsTrigger>
            {/* <TabsTrigger value="proxy">Proxy Access</TabsTrigger> */}
            {/* HIDDEN: Notifications, Security tabs hidden per UI requirements */}
            {/* <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger> */}
          </TabsList>

          <TabsContent value="general">
            <Card className="shadow-soft">
              <CardHeader>
                <div>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>Update your contact details and emergency contacts.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" defaultValue={patientDetails?.first_name || ""} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" defaultValue={patientDetails?.last_name || ""} disabled />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" defaultValue={patientDetails?.email || ""} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Home Address</Label>
                  <Input id="address" defaultValue={patientDetails?.address1 || ""} disabled />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="proxy">
            <Card className="shadow-soft border-l-4 border-l-blue-500">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Proxy Access Management</CardTitle>
                    <CardDescription>
                      Grant family members or caregivers access to your health records.
                    </CardDescription>
                  </div>
                  {/* <Button size="sm" className="bg-blue-600 hover:bg-blue-700">Invite Proxy</Button> */}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-medium">Active Proxies</h3>
                  {isLoadingProxies ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : proxies.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No active proxies found.</p>
                  ) : (
                    proxies.map((proxy) => {
                      const initials = proxy.proxy_name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase();
                      const isSelected = selectedProxyId === proxy.id;
                      return (
                        <div key={proxy.id}>
                          <div
                            className="flex items-center justify-between p-4 border rounded-lg bg-secondary/30 cursor-pointer"
                            onClick={() => handleProxyClick(proxy.id)}
                          >
                            <div className="flex items-center gap-4">
                              <Avatar>
                                <AvatarFallback>{initials}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{proxy.proxy_name}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={revokingId === proxy.id}
                                onClick={(e) => { e.stopPropagation(); handleRevokeProxy(proxy.id); }}
                              >
                                {revokingId === proxy.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Revoke"}
                              </Button>
                            </div>
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateRows: isSelected ? "1fr" : "0fr",
                              transition: "grid-template-rows 300ms ease",
                            }}
                          >
                            <div style={{ overflow: "hidden" }}>
                              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 mt-2">
                                <h4 className="font-semibold text-blue-900 text-sm mb-2">Access History</h4>
                                {loadingHistoryId === proxy.id ? (
                                  <div className="flex items-center justify-center py-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                                  </div>
                                ) : (proxyHistory[proxy.id] ?? []).length === 0 ? (
                                  <p className="text-xs text-blue-800">No access history found.</p>
                                ) : (
                                  <div
                                    className="space-y-2 overflow-y-auto pr-1 proxy-history-scrollbar"
                                    style={{ maxHeight: "calc(5 * (1.25rem + 0.5rem))" }}
                                  >
                                    {(proxyHistory[proxy.id] ?? []).map((entry, idx) => (
                                      <div key={idx} className="flex justify-between text-xs text-blue-800">
                                        <span>{entry.action}</span>
                                        <span className="text-blue-600">{entry.accessed_at_human}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h3 className="text-sm font-medium">Invite New Proxy</h3>
                  <form onSubmit={handleProxyInvite} className="flex gap-4">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="proxyEmail" className="sr-only">Email Address</Label>
                      <Input
                        id="proxyEmail"
                        type="email"
                        placeholder="Enter email address"
                        value={proxyEmail}
                        onChange={(e) => setProxyEmail(e.target.value)}
                        required
                        disabled={isInviting}
                      />
                    </div>
                    <Button type="submit" disabled={isInviting}>
                      {isInviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Send Invite
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* HIDDEN: Notifications tab content hidden per UI requirements
          <TabsContent value="notifications">
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Choose how you want to receive updates.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between space-x-2">
                  <div className="flex items-center space-x-4">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <Label className="text-base">Email Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive appointment reminders and result alerts via email.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={notifications.email}
                    onCheckedChange={() => handleNotificationChange('email')}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between space-x-2">
                  <div className="flex items-center space-x-4">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <Label className="text-base">SMS Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive text messages for urgent updates.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={notifications.sms}
                    onCheckedChange={() => handleNotificationChange('sms')}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between space-x-2">
                  <div className="flex items-center space-x-4">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <Label className="text-base">Push Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive alerts on your mobile device.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={notifications.push}
                    onCheckedChange={() => handleNotificationChange('push')}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          */}

          {/* HIDDEN: Security tab content hidden per UI requirements
          <TabsContent value="security">
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>Manage your password and authentication methods.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Two-Factor Authentication</Label>
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-green-600" />
                      <span className="font-medium">Enabled</span>
                    </div>
                    <Button variant="outline" size="sm">Configure</Button>
                  </div>
                </div>
                <div className="pt-4">
                  <Button variant="outline" className="w-full">Change Password</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          */}
        </Tabs>
      </div>
    </div>
  );
}
