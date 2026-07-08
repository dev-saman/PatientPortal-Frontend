import { useState, useEffect } from "react";
import {
  Clock,
  MapPin,
  Video,
  CalendarDays,
  X,
  Loader2,
} from "lucide-react";
import PageLoader from "@/components/PageLoader";
import ScheduleAppointmentModal from "@/components/ScheduleAppointmentModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parse, isValid } from "date-fns";
import Apis from "@/lib/Apis";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatDate, getDayOfWeek, getMonthShort, getDayOfMonth, getAppointmentTimestamp } from "@/lib/utils";

interface Appointment {
  id: number;
  attend_date: string;
  service_full_name: string;
  attend_type_full_name: string;
  provider_name: string;
  time: string;
  end_time: string;
  department: string;
  attend_type?: string;
  status?: string;
  is_virtual_text?: string | null;
  appt_status?: string | null;
}

const APPOINTMENT_STATUS_STYLES: Record<string, string> = {
  Confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  "Action Required": "bg-amber-50 text-amber-700 border-amber-200",
};

const APPOINTMENT_VISIT_TYPE_STYLES: Record<string, string> = {
  "In-Person": "bg-purple-50 text-purple-700 border-purple-200",
  Telehealth: "bg-green-50 text-green-700 border-green-200",
};

const renderAppointmentTag = (
  value: string | null | undefined,
  stylesMap: Record<string, string>
) => {
  if (!value) return null;
  const normalizedValue = value.trim();
  if (!normalizedValue) return null;

  const tagClassName = stylesMap[normalizedValue];
  if (!tagClassName) return null;

  return (
    <Badge variant="outline" className={tagClassName}>
      {normalizedValue}
    </Badge>
  );
};

// Format time to 12-hour format with AM/PM
const formatTime = (timeString: string): string => {
  if (!timeString) return "";
  try {
    const [hours, minutes] = timeString.split(":").map(Number);
    const date = new Date(2000, 0, 1, hours, minutes);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return timeString;
  }
};

// Calculate duration between two times in minutes
const calculateDuration = (startTime: string, endTime: string): number => {
  if (!startTime || !endTime) return 0;
  try {
    const [startHours, startMinutes] = startTime.split(":").map(Number);
    const [endHours, endMinutes] = endTime.split(":").map(Number);
    
    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;
    
    return endTotalMinutes - startTotalMinutes;
  } catch {
    return 0;
  }
};

// Get sortable date/time value for chronological appointment ordering
const getAppointmentDateTime = (appointment: Appointment): number =>
  getAppointmentTimestamp(appointment.attend_date, appointment.time);

// Format date to YYYY-MM-DD for the native date input
const formatDateInput = (dateString: string): string => {
  if (!dateString) return "";
  const isoMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  return dateString;
};

const ITEMS_PER_PAGE = 5;

const formatKey = (key: string): string =>
  key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

interface AppointmentDetail {
  id: number;
  ma_id: number;
  department: string;
  service: string;
  attend_type: string;
  provider_id: number;
  provider_name: string;
  attend_date: string;
  time: string;
  end_time: string;
  length: string;
  attend_status: string;
  attend_notes: string | null;
  is_virtual: number;
  transport: number;
}

interface RescheduleReason {
  id: number;
  reason: string;
}

// Generate time options every 30 minutes across a day
const generateTimeOptions = (): string[] => {
  const times: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      times.push(`${hh}:${mm}`);
    }
  }
  return times;
};

const TIME_OPTIONS = generateTimeOptions();

export default function Appointments() {
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [pastAppointments, setPastAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [displayedUpcomingCount, setDisplayedUpcomingCount] = useState(ITEMS_PER_PAGE);
  const [displayedPastCount, setDisplayedPastCount] = useState(ITEMS_PER_PAGE);
  const [selectedVisit, setSelectedVisit] = useState<Record<string, unknown> | null>(null);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleAppointment, setRescheduleAppointment] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleStartTime, setRescheduleStartTime] = useState("");
  const [rescheduleEndTime, setRescheduleEndTime] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [isModalLoading, setIsModalLoading] = useState(false);
  const [isRescheduleSubmitting, setIsRescheduleSubmitting] = useState(false);
  const [appointmentDetail, setAppointmentDetail] = useState<AppointmentDetail | null>(null);
  const [rescheduleReasons, setRescheduleReasons] = useState<RescheduleReason[]>([]);

  const openRescheduleModal = async (appointment: Appointment) => {
    setRescheduleAppointment(appointment);
    setRescheduleDate("");
    setRescheduleStartTime("");
    setRescheduleEndTime("");
    setRescheduleReason("");
    setAppointmentDetail(null);
    setRescheduleReasons([]);
    setIsModalLoading(true);
    setIsRescheduleOpen(true);

    try {
      const [apptRes, reasonsRes] = await Promise.all([
        Apis.getAppointment(appointment.id),
        Apis.getAppointmentReasons(),
      ]);

      if (apptRes.success && Array.isArray(apptRes.data) && apptRes.data.length > 0) {
        const detail: AppointmentDetail = apptRes.data[0];
        setAppointmentDetail(detail);
        setRescheduleDate(formatDateInput(detail.attend_date));
        setRescheduleStartTime(detail.time ? detail.time.substring(0, 5) : "");
        setRescheduleEndTime(detail.end_time ? detail.end_time.substring(0, 5) : "");
      } else {
        toast.error(apptRes.message || apptRes.error || "Failed to load appointment details.");
      }

      if (reasonsRes.success && Array.isArray(reasonsRes.data)) {
        setRescheduleReasons(reasonsRes.data);
      } else {
        toast.error(reasonsRes.message || reasonsRes.error || "Failed to load reschedule reasons.");
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsModalLoading(false);
    }
  };

  const closeRescheduleModal = () => {
    // Only flip the open flag — keep appointment data so content stays visible
    // during Radix's exit animation. Data is cleared after animation completes.
    setIsRescheduleOpen(false);
  };

  const refreshUpcomingAppointments = async () => {
    try {
      const data = await Apis.getPatientAppointments();
      if (data.success) {
        const upcoming = [...(data.upcoming_appointments || [])].sort(
          (a, b) => getAppointmentDateTime(a) - getAppointmentDateTime(b)
        );
        setUpcomingAppointments(upcoming);
      }
    } catch {
      // silently ignore refresh errors
    }
  };

  const handleRescheduleSubmit = async () => {
    if (!rescheduleReason) {
      toast.error("Please select a reason for rescheduling.");
      return;
    }
    if (!appointmentDetail) return;

    const selectedReasonObj = rescheduleReasons.find((r) => String(r.id) === rescheduleReason);
    if (!selectedReasonObj) return;

    setIsRescheduleSubmitting(true);
    try {
      const res = await Apis.rescheduleAppointment(appointmentDetail.id, appointmentDetail.ma_id, {
        department: appointmentDetail.department,
        service: appointmentDetail.service,
        provider_name: appointmentDetail.provider_name,
        provider_id: appointmentDetail.provider_id,
        attend_type: appointmentDetail.attend_type,
        attend_status: "RS",
        attend_date: rescheduleDate,
        time: rescheduleStartTime,
        end_time: rescheduleEndTime,
        attend_notes: selectedReasonObj.reason,
        attend_reason_id: selectedReasonObj.id,
      });

      if (res.success === false) {
        toast.error(res.message || res.error || "Failed to reschedule appointment.");
      } else {
        toast.success("Appointment rescheduled successfully.");
        closeRescheduleModal();
        refreshUpcomingAppointments();
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsRescheduleSubmitting(false);
    }
  };

  // Fetch appointments on component mount
  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        const data = await Apis.getPatientAppointments();

        if (!data.success) {
          toast.error(data.message || data.error || "");
          setIsLoading(false);
          return;
        }

        // Separate upcoming and past appointments
        const upcoming = [...(data.upcoming_appointments || [])].sort(
          (a, b) => getAppointmentDateTime(a) - getAppointmentDateTime(b)
        );
        const past = data.past_appointments || [];

        setUpcomingAppointments(upcoming);
        setPastAppointments(past);
      } catch (error) {
        console.error("Error fetching appointments:", error);
        toast.error(getApiErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    };

    fetchAppointments();
  }, []);

  // Show full-page loader while loading
  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Appointments</h1>
          <p className="text-muted-foreground">Manage your upcoming visits and view past history.</p>
        </div>
        {/* <Button className="bg-primary hover:bg-primary/90" onClick={() => setScheduleModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Schedule Appointment
        </Button> */}
        <ScheduleAppointmentModal open={scheduleModalOpen} onClose={() => setScheduleModalOpen(false)} />
      </div>

      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past Visits</TabsTrigger>
        </TabsList>
        
        <TabsContent value="upcoming" className="mt-6 space-y-4">
          {upcomingAppointments.length === 0 ? (
            <Card className="shadow-soft">
              <CardContent className="p-6 text-center text-muted-foreground">
                No upcoming appointments. Schedule a visit to get started.
              </CardContent>
            </Card>
          ) : (
            <>
              {upcomingAppointments.slice(0, displayedUpcomingCount).map((appointment, index) => {
              const duration = calculateDuration(appointment.time, appointment.end_time);
              const isVirtual =
                appointment.is_virtual_text?.toLowerCase() === "telehealth" ||
                appointment.attend_type?.toLowerCase().includes("virtual") ||
                appointment.attend_type?.toLowerCase().includes("telehealth");
              
              return (
                <Card key={appointment.id || index} className="shadow-soft border-l-4 border-l-primary">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-shrink-0 flex flex-col items-center justify-center bg-secondary/50 rounded-xl p-4 w-full md:w-32 text-center">
                        <span className="text-sm font-bold text-primary uppercase tracking-wider">
                          {getMonthShort(appointment.attend_date)}
                        </span>
                        <span className="text-3xl font-bold my-1">
                          {getDayOfMonth(appointment.attend_date)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {getDayOfWeek(appointment.attend_date)}
                        </span>
                      </div>
                      
                      <div className="flex-1 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              {renderAppointmentTag(appointment.appt_status, APPOINTMENT_STATUS_STYLES)}
                              {renderAppointmentTag(appointment.is_virtual_text, APPOINTMENT_VISIT_TYPE_STYLES)}
                            </div>
                            <h3 className="text-xl font-bold">
                              {appointment.service_full_name} {appointment.attend_type_full_name}
                            </h3>
                            <p className="text-muted-foreground">with {appointment.provider_name}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div className="flex items-center gap-3">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span>
                              {formatTime(appointment.time)} - {formatTime(appointment.end_time)} ({duration} min)
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            {isVirtual ? (
                              <>
                                <Video className="h-4 w-4 text-muted-foreground" />
                                <span>Video Visit</span>
                              </>
                            ) : (
                              <>
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <span>{appointment.department}</span>
                              </>
                            )}
                          </div>
                        </div>

      
                        <div className="flex flex-wrap gap-3 pt-2">
                          {/* <Button className="bg-primary hover:bg-primary/90">
                            eCheck-In
                          </Button> */}
                          {/* <Button variant="outline" onClick={() => openRescheduleModal(appointment)}>
                            Reschedule
                          </Button> */}
                          {/* <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            Cancel
                          </Button> */}
                        </div>
                       
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
              {upcomingAppointments.length > ITEMS_PER_PAGE && displayedUpcomingCount < upcomingAppointments.length && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setDisplayedUpcomingCount(prev => prev + ITEMS_PER_PAGE)}
                  >
                    Load More
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-6">
          <Card className="shadow-soft">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Visit History</CardTitle>
                {/* HIDDEN: Filter button hidden per UI requirements
                {pastAppointments.length > 0 && (
                  <Button variant="outline" size="sm">
                    <Filter className="mr-2 h-4 w-4" /> Filter
                  </Button>
                )}
                */}
              </div>
            </CardHeader>
            <CardContent>
              {pastAppointments.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No past visits found.
                </div>
              ) : (
                <div className="space-y-6">
                  {pastAppointments.slice(0, displayedPastCount).map((visit, i) => (
                    <div key={visit.id || i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b last:border-0 last:pb-0">
                      <div>
                        <p className="font-semibold text-lg">
                          {visit.service_full_name} {visit.attend_type_full_name}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <span>{formatDate(visit.attend_date)}</span>
                          <span>•</span>
                          <span>{visit.provider_name}</span>
                          <span>•</span>
                          <span>{visit.attend_type || "In-Person"}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setSelectedVisit(visit as unknown as Record<string, unknown>)}>View Summary</Button>
                        <Button variant="outline" size="sm" onClick={() => {
                          const url = (visit as unknown as Record<string, unknown>)["clinical_note"] as string | null | undefined;
                          if (url) {
                            window.open(url, "_blank", "noopener,noreferrer");
                          } else {
                            toast.error("Note is not available.");
                          }
                        }}>Notes</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            {pastAppointments.length > ITEMS_PER_PAGE && displayedPastCount < pastAppointments.length && (
              <CardFooter className="bg-secondary/20 border-t p-4 flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDisplayedPastCount(prev => prev + ITEMS_PER_PAGE)}
                >
                  Load More History
                </Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Physician Reschedule Modal */}
      <Dialog open={isRescheduleOpen} onOpenChange={(open) => { if (!open) closeRescheduleModal(); }}>
        <DialogContent
          showCloseButton={false}
          className="!max-w-[980px] w-[90%] max-h-[90vh] p-5 gap-0 pointer-events-auto flex flex-col"
          onAnimationEnd={() => { if (!isRescheduleOpen) { setRescheduleAppointment(null); setAppointmentDetail(null); setRescheduleReasons([]); } }}
        >
          <DialogHeader className="pb-4 border-b border-border min-h-auto flex-shrink-0">
            <div className="flex items-center justify-between w-full">
              <DialogTitle className="text-xl font-semibold">
                Physician Reschedule
                {rescheduleAppointment && (
                  <span className="font-normal text-muted-foreground">
                    {" – "}{rescheduleAppointment.provider_name}
                  </span>
                )}
              </DialogTitle>
              <button
                onClick={closeRescheduleModal}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>

          {rescheduleAppointment && (
            <div className="py-5 space-y-5 overflow-auto">
              {isModalLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Row 1: Location | Speciality/Service Type | Physician */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Location</label>
                      <input
                        readOnly
                        value={appointmentDetail?.department || "—"}
                        className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-foreground cursor-default focus:outline-none focus:ring-0"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Speciality/Service Type</label>
                      <input
                        readOnly
                        value={rescheduleAppointment.service_full_name || "—"}
                        className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-foreground cursor-default focus:outline-none focus:ring-0"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Physician</label>
                      <input
                        readOnly
                        value={appointmentDetail?.provider_name || "—"}
                        className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-foreground cursor-default focus:outline-none focus:ring-0"
                      />
                    </div>
                  </div>

                  {/* Row 2: Visit Type | Visit Status */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Visit Type</label>
                      <input
                        readOnly
                        value={appointmentDetail?.attend_type || "—"}
                        className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-foreground cursor-default focus:outline-none focus:ring-0"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Visit Status</label>
                      <input
                        readOnly
                        value={rescheduleAppointment.appt_status || rescheduleAppointment.status || "—"}
                        className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-foreground cursor-default focus:outline-none focus:ring-0"
                      />
                    </div>
                  </div>

                  {/* Row 3: Date | Start Time | End Time */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Date</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 pr-3 text-sm text-foreground text-left flex items-center justify-between focus:outline-none focus:ring-0"
                          >
                            <span className={rescheduleDate ? "text-foreground" : "text-muted-foreground"}>
                              {rescheduleDate
                                ? format(parse(rescheduleDate, "yyyy-MM-dd", new Date()), "MM-dd-yyyy")
                                : "MM-DD-YYYY"}
                            </span>
                            <CalendarDays className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="p-0 w-[--radix-popover-trigger-width]"
                        >
                          <Calendar
                            mode="single"
                            selected={
                              rescheduleDate && isValid(parse(rescheduleDate, "yyyy-MM-dd", new Date()))
                                ? parse(rescheduleDate, "yyyy-MM-dd", new Date())
                                : undefined
                            }
                            defaultMonth={
                              rescheduleDate && isValid(parse(rescheduleDate, "yyyy-MM-dd", new Date()))
                                ? parse(rescheduleDate, "yyyy-MM-dd", new Date())
                                : undefined
                            }
                            onSelect={(date) => {
                              setRescheduleDate(date ? format(date, "yyyy-MM-dd") : "");
                            }}
                            className="w-full"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Start Time</label>
                      <select
                        disabled
                        value={rescheduleStartTime}
                        onChange={(e) => setRescheduleStartTime(e.target.value)}
                        className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-foreground cursor-default focus:outline-none focus:ring-0 appearance-none"
                      >
                        {TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {formatTime(t)}{appointmentDetail && t === appointmentDetail.time.substring(0, 5) ? " (Current)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-muted-foreground">End Time</label>
                      <select
                        disabled
                        value={rescheduleEndTime}
                        onChange={(e) => setRescheduleEndTime(e.target.value)}
                        className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-foreground cursor-default focus:outline-none focus:ring-0 appearance-none"
                      >
                        {TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {formatTime(t)}{appointmentDetail && t === appointmentDetail.end_time.substring(0, 5) ? " (Current)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Row 4: Reason for Reschedule */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-muted-foreground">
                      Reason for Reschedule <span className="text-destructive">*</span>
                    </label>
                    <select
                      value={rescheduleReason}
                      onChange={(e) => setRescheduleReason(e.target.value)}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-0 appearance-none"
                      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
                    >
                      <option value="">--Select Reason--</option>
                      {rescheduleReasons.map((r) => (
                        <option key={r.id} value={String(r.id)}>{r.reason}</option>
                      ))}
                    </select>
                  </div>

                  {/* Re-Schedule button */}
                  <div className="flex justify-center pt-2 w-50 mx-auto">
                    <Button
                      className="bg-primary hover:bg-primary/90 px-1 w-full"
                      disabled={isRescheduleSubmitting}
                      onClick={handleRescheduleSubmit}
                    >
                      {isRescheduleSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CalendarDays className="h-4 w-4" />
                      )}
                      Re-Schedule
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Visit Summary Modal */}
      <Dialog open={!!selectedVisit} onOpenChange={(open) => { if (!open) setSelectedVisit(null); }}>
        <DialogContent
          showCloseButton={false}
          className="!max-w-[900px] w-[90%] max-h-[90vh] p-5 gap-0 pointer-events-auto flex flex-col"
        >
          <DialogHeader className="pb-4 border-b border-border min-h-auto flex-shrink-0">
            <div className="flex items-center justify-between w-full">
              <DialogTitle className="text-xl font-semibold">
                {selectedVisit
                  ? `${selectedVisit.service_full_name ?? ""} ${selectedVisit.attend_type_full_name ?? ""}`.trim()
                  : ""}
              </DialogTitle>
              <button
                onClick={() => setSelectedVisit(null)}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>

          <div className="py-4 overflow-auto">
            {selectedVisit && (() => {
              const TOP_KEYS = ["appt_status", "is_virtual_text", "department"];
              const HIDDEN_KEYS = ["id", "ma_id", "provider_id", "is_virtual", "clinical_note"];
              const topEntries = TOP_KEYS
                .map((k) => ({ key: k, value: selectedVisit[k] }))
                .filter(({ value }) => value !== null && value !== undefined && value !== "");
              const cardEntries = Object.entries(selectedVisit).filter(([k]) => !TOP_KEYS.includes(k) && !HIDDEN_KEYS.includes(k));

              return (
                <>
                  {topEntries.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-5">
                      {topEntries.map(({ key, value }) => (
                        <span
                          key={key}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-background text-sm font-medium text-foreground"
                        >
                          {key === "appt_status" && (
                            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                          )}
                          {String(value)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {cardEntries.map(([key, value]) => (
                      <div
                        key={key}
                        className="rounded-lg bg-muted/50 px-4 py-3"
                      >
                        <p className="text-sm font-bold text-foreground mb-0.5">
                          {formatKey(key)}
                        </p>
                        <p className="text-sm font-normal text-muted-foreground break-words">
                          {value !== null && value !== undefined && value !== ""
                            ? key === "clinical_note"
                              ? (() => {
                                  const raw = String(value);
                                  const filename = raw.split(/[\\/]/).pop() || raw;
                                  return filename;
                                })()
                              : /^\d{4}-\d{2}-\d{2}/.test(String(value))
                                ? formatDate(String(value))
                                : String(value)
                            : key === "clinical_note" ? "No file available" : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
