import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, FileText, Calendar, LogOut, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { fadeIn, slideUp, staggerContainer } from "@/lib/animations";
import InstallPrompt from "@/components/InstallPrompt";
import { formatDate } from "@/lib/utils";

export default function Home() {
  const { user, logout } = useAuth();
  const [messages, setMessages] = useState([]);
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));

        const [msgRes, formRes] = await Promise.all([
          fetch("http://10.0.0.25:3002/api/messages"),
          fetch("http://10.0.0.25:3002/api/forms")
        ]);

        if (msgRes.ok) setMessages(await msgRes.json());
        if (formRes.ok) setForms(await formRes.json());
      } catch (error) {
        console.error("Failed to fetch patient data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-red-800 rounded-lg flex items-center justify-center text-white font-bold">
              A
            </div>
            <span className="font-bold text-xl text-gray-900 hidden sm:block">AdvantageHCS</span>
          </div>
          
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5 text-gray-600" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
            </Button>
            
            <div className="flex items-center gap-3 pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-500">Patient</p>
              </div>
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-800 font-bold">
                {user?.name?.charAt(0)}
              </div>
              <Button variant="ghost" size="icon" onClick={() => logout()}>
                <LogOut className="w-4 h-4 text-gray-500" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div 
          className="space-y-8"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {/* Welcome Section */}
          <motion.div 
            variants={slideUp}
            className="bg-gradient-to-r from-red-800 to-red-600 rounded-2xl p-8 text-white shadow-lg"
          >
            <h1 className="text-3xl font-bold mb-2">Welcome back, {user?.name}!</h1>
            <p className="text-red-100">Manage your health records, appointments, and messages all in one place.</p>
          </motion.div>

          {/* Dashboard Tabs */}
          <Tabs defaultValue="dashboard" className="space-y-6">
            <TabsList className="bg-white p-1 rounded-xl border shadow-sm w-full sm:w-auto grid grid-cols-3 sm:flex">
              <TabsTrigger value="dashboard" className="rounded-lg">Dashboard</TabsTrigger>
              <TabsTrigger value="appointments" className="rounded-lg">Appointments</TabsTrigger>
              <TabsTrigger value="documents" className="rounded-lg">Documents</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Messages Card */}
                <motion.div variants={fadeIn}>
                  <Card className="h-full shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-red-50 rounded-lg">
                          <User className="w-5 h-5 text-red-600" />
                        </div>
                        <CardTitle className="text-lg">Recent Messages</CardTitle>
                      </div>
                      <Button variant="outline" size="sm">View All</Button>
                    </CardHeader>
                    <CardContent>
                      {loading ? (
                        <div className="space-y-4">
                          <Skeleton className="h-16 w-full rounded-lg" />
                          <Skeleton className="h-16 w-full rounded-lg" />
                        </div>
                      ) : messages.length > 0 ? (
                        <div className="space-y-4">
                          {messages.map((msg: any) => (
                            <div key={msg.id} className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                              <div className="flex justify-between items-start mb-1">
                                <h4 className="font-semibold text-gray-900">{msg.subject}</h4>
                                <span className="text-xs text-gray-500">
                                  {formatDate(msg.created_at)}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 line-clamp-2">{msg.body}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">No new messages</div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Forms Card */}
                <motion.div variants={fadeIn}>
                  <Card className="h-full shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <CardTitle className="text-lg">Pending Forms</CardTitle>
                      </div>
                      <Button variant="outline" size="sm">View All</Button>
                    </CardHeader>
                    <CardContent>
                      {loading ? (
                        <div className="space-y-4">
                          <Skeleton className="h-14 w-full rounded-lg" />
                          <Skeleton className="h-14 w-full rounded-lg" />
                        </div>
                      ) : forms.length > 0 ? (
                        <div className="space-y-3">
                          {forms.map((form: any) => (
                            <div key={form.id} className="flex items-center justify-between p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                  <FileText className="w-4 h-4 text-blue-600" />
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900">Form ID: {form.form_id}</p>
                                  <p className="text-xs text-gray-500">Status: {form.status}</p>
                                </div>
                              </div>
                              <Button size="sm" variant="secondary" className="bg-white hover:bg-gray-50">
                                Complete
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">No pending forms</div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </TabsContent>

            <TabsContent value="appointments">
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Calendar className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">No Upcoming Appointments</h3>
                  <p className="text-gray-500 mb-6">You have no appointments scheduled at this time.</p>
                  <Button>Schedule Appointment</Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents">
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">No Documents Found</h3>
                  <p className="text-gray-500">Your medical documents will appear here once uploaded.</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>
      
      <InstallPrompt />
    </div>
  );
}
