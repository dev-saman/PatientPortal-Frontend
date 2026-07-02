import { 
  CreditCard, 
  Download, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Billing() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing & Insurance</h1>
          <p className="text-muted-foreground">View statements, make payments, and manage insurance.</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 shadow-md">
          <CreditCard className="mr-2 h-4 w-4" />
          Make a Payment
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Balance Overview */}
        <Card className="lg:col-span-2 shadow-soft border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle>Current Balance</CardTitle>
            <CardDescription>As of October 12, 2024</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-8 items-center">
              <div className="text-center md:text-left">
                <span className="text-4xl font-bold text-foreground">$45.00</span>
                <p className="text-sm text-muted-foreground mt-1">Total Amount Due</p>
                <Badge variant="outline" className="mt-3 bg-yellow-50 text-yellow-700 border-yellow-200">
                  Due by Oct 30
                </Badge>
              </div>
              
              <div className="flex-1 w-full space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Patient Responsibility</span>
                    <span className="font-medium">$45.00</span>
                  </div>
                  <Progress value={100} className="h-2 bg-secondary" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Insurance Pending</span>
                    <span className="font-medium">$120.00</span>
                  </div>
                  <Progress value={60} className="h-2 bg-secondary" />
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-secondary/20 border-t p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 text-primary" />
              <span>You have a copay of $25.00 due for your upcoming visit on Oct 14.</span>
            </div>
          </CardFooter>
        </Card>

        {/* Insurance Card */}
        <Card className="shadow-soft bg-gradient-to-br from-blue-600 to-blue-800 text-white border-none">
          <CardHeader>
            <div className="flex justify-between items-start">
              <CardTitle className="text-white">Primary Insurance</CardTitle>
              <Badge className="bg-white/20 hover:bg-white/30 text-white border-none">Active</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="text-blue-100 text-sm uppercase tracking-wider font-medium">Plan Name</p>
              <p className="text-xl font-bold">BlueCross BlueShield</p>
              <p className="text-blue-100 text-sm">PPO Gold Plan</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-blue-100 text-xs uppercase tracking-wider">Member ID</p>
                <p className="font-mono font-medium">XYZ123456789</p>
              </div>
              <div>
                <p className="text-blue-100 text-xs uppercase tracking-wider">Group #</p>
                <p className="font-mono font-medium">98765</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t border-white/10 pt-4">
            <Button variant="ghost" className="w-full text-white hover:bg-white/10 hover:text-white justify-between px-0">
              View Details <ChevronRight className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Tabs defaultValue="history" className="w-full">
        <TabsList>
          <TabsTrigger value="history">Payment History</TabsTrigger>
          <TabsTrigger value="statements">Statements</TabsTrigger>
        </TabsList>
        
        <TabsContent value="history" className="mt-6">
          <Card className="shadow-soft">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { date: "Oct 05, 2024", desc: "Copay - Office Visit", method: "Visa •••• 4242", status: "Processed", amount: "$25.00" },
                    { date: "Sep 12, 2024", desc: "Lab Services", method: "Visa •••• 4242", status: "Processed", amount: "$15.00" },
                    { date: "Aug 28, 2024", desc: "Annual Wellness", method: "Insurance", status: "Paid", amount: "$150.00" },
                  ].map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{item.date}</TableCell>
                      <TableCell>{item.desc}</TableCell>
                      <TableCell className="text-muted-foreground">{item.method}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex w-fit items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold">{item.amount}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon">
                          <Download className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statements" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { date: "Oct 01, 2024", amount: "$45.00", status: "Due", due: "Oct 30" },
              { date: "Sep 01, 2024", amount: "$25.00", status: "Paid", due: "Sep 30" },
              { date: "Aug 01, 2024", amount: "$0.00", status: "Paid", due: "Aug 30" },
            ].map((stmt, i) => (
              <Card key={i} className="shadow-sm hover:shadow-md transition-all">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="p-2 bg-secondary rounded-lg">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    {stmt.status === "Due" ? (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                        Due {stmt.due}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Paid
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="mt-4">Statement - {stmt.date}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{stmt.amount}</p>
                  <p className="text-sm text-muted-foreground">Statement Balance</p>
                </CardContent>
                <CardFooter className="border-t pt-4">
                  <Button variant="outline" className="w-full">
                    <Download className="mr-2 h-4 w-4" /> Download PDF
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
