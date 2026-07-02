import { 
  Activity, 
  Pill, 
  FileText, 
  AlertCircle, 
  ChevronDown, 
  Download,
  TrendingUp,
  TrendingDown,
  Minus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Health() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Health</h1>
        <p className="text-muted-foreground">View your test results, medications, and health summary.</p>
      </div>

      <Tabs defaultValue="results" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="results">Test Results</TabsTrigger>
          <TabsTrigger value="medications">Medications</TabsTrigger>
          <TabsTrigger value="summary">Health Summary</TabsTrigger>
        </TabsList>

        {/* Test Results Tab */}
        <TabsContent value="results" className="mt-6 space-y-6">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle>Recent Lab Results</CardTitle>
              <CardDescription>Results from your last visit on Oct 01, 2024</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <Activity className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="text-left">
                          <p className="font-semibold">Lipid Panel</p>
                          <p className="text-sm text-muted-foreground">Oct 01, 2024</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                        1 Abnormal
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-4 pb-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Component</TableHead>
                          <TableHead>Your Value</TableHead>
                          <TableHead>Standard Range</TableHead>
                          <TableHead>Trend</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">Total Cholesterol</TableCell>
                          <TableCell className="text-yellow-600 font-bold">210 mg/dL</TableCell>
                          <TableCell className="text-muted-foreground">100 - 199 mg/dL</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-red-500 text-xs">
                              <TrendingUp className="h-4 w-4" /> +5%
                            </div>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">HDL Cholesterol</TableCell>
                          <TableCell className="text-green-600 font-bold">65 mg/dL</TableCell>
                          <TableCell className="text-muted-foreground">&gt; 39 mg/dL</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-green-500 text-xs">
                              <TrendingUp className="h-4 w-4" /> +2%
                            </div>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">LDL Cholesterol</TableCell>
                          <TableCell>128 mg/dL</TableCell>
                          <TableCell className="text-muted-foreground">0 - 99 mg/dL</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-muted-foreground text-xs">
                              <Minus className="h-4 w-4" /> Stable
                            </div>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                    <div className="mt-4 p-4 bg-secondary/30 rounded-lg text-sm">
                      <p className="font-semibold mb-1">Doctor's Note:</p>
                      <p className="text-muted-foreground">
                        "Your HDL (good cholesterol) is excellent. Total cholesterol is slightly elevated but stable. Let's continue with diet and exercise."
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-2">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-purple-50 rounded-lg">
                          <Activity className="h-5 w-5 text-purple-600" />
                        </div>
                        <div className="text-left">
                          <p className="font-semibold">Complete Blood Count (CBC)</p>
                          <p className="text-sm text-muted-foreground">Oct 01, 2024</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Normal
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      All values within standard range.
                      <Button variant="link" className="text-primary h-auto p-0 ml-1">View Full Report</Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Medications Tab */}
        <TabsContent value="medications" className="mt-6">
          <div className="grid gap-6">
            <Card className="shadow-soft">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Active Medications</CardTitle>
                  <CardDescription>Prescriptions currently on file</CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" /> Print List
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { name: "Lisinopril", dose: "10mg Tablet", freq: "Take 1 tablet daily", prescriber: "Dr. Sarah Smith", refills: 2 },
                    { name: "Atorvastatin", dose: "20mg Tablet", freq: "Take 1 tablet at bedtime", prescriber: "Dr. Sarah Smith", refills: 0 },
                  ].map((med, i) => (
                    <div key={i} className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-xl bg-card hover:bg-secondary/20 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-blue-50 rounded-lg mt-1">
                          <Pill className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg">{med.name}</h3>
                          <p className="font-medium text-sm text-foreground/80">{med.dose}</p>
                          <p className="text-sm text-muted-foreground mt-1">{med.freq}</p>
                          <p className="text-xs text-muted-foreground mt-2">Prescribed by {med.prescriber}</p>
                        </div>
                      </div>
                      <div className="mt-4 md:mt-0 flex flex-col items-end gap-2">
                        <Badge variant={med.refills > 0 ? "outline" : "destructive"} className={med.refills > 0 ? "bg-green-50 text-green-700 border-green-200" : ""}>
                          {med.refills} Refills Remaining
                        </Badge>
                        <Button size="sm" className={med.refills > 0 ? "bg-primary hover:bg-primary/90" : "bg-secondary text-muted-foreground hover:bg-secondary"} disabled={med.refills === 0}>
                          {med.refills > 0 ? "Request Refill" : "Renew Prescription"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Health Summary Tab */}
        <TabsContent value="summary" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  Allergies
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-100">
                    <span className="font-medium text-red-900">Penicillin</span>
                    <Badge variant="destructive">Severe</Badge>
                  </li>
                  <li className="flex justify-between items-center p-3 bg-secondary/50 rounded-lg border border-border">
                    <span className="font-medium">Peanuts</span>
                    <Badge variant="secondary">Mild</Badge>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-600" />
                  Conditions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="p-3 bg-secondary/50 rounded-lg border border-border">
                    <p className="font-medium">Hypertension (Essential)</p>
                    <p className="text-xs text-muted-foreground">Diagnosed: 2019</p>
                  </li>
                  <li className="p-3 bg-secondary/50 rounded-lg border border-border">
                    <p className="font-medium">Hyperlipidemia</p>
                    <p className="text-xs text-muted-foreground">Diagnosed: 2021</p>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="shadow-soft md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-purple-600" />
                  Immunizations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vaccine</TableHead>
                      <TableHead>Date Given</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Influenza (Flu)</TableCell>
                      <TableCell>Oct 05, 2024</TableCell>
                      <TableCell><Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Up to Date</Badge></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">COVID-19 (Moderna)</TableCell>
                      <TableCell>Nov 12, 2023</TableCell>
                      <TableCell><Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Completed</Badge></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Tetanus (Tdap)</TableCell>
                      <TableCell>Jun 15, 2020</TableCell>
                      <TableCell><Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Up to Date</Badge></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
