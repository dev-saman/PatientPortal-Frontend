import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Admin dashboard feature coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}
