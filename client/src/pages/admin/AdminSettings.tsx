import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminSettings() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Admin settings feature coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}
