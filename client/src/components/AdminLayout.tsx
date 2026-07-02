import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Settings, 
  LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import MobileNav from "./MobileNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { logout, user } = useAuth();

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/admin" },
    { icon: Users, label: "User Management", href: "/admin/users" },
    { icon: FileText, label: "Reports", href: "/admin/reports" },
    { icon: Settings, label: "Settings", href: "/admin/settings" },
  ];

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Desktop Sidebar - Hidden on Mobile/Tablet (md breakpoint) */}
      <div className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col fixed h-full z-30">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <div className="w-8 h-8 bg-red-800 rounded-lg flex items-center justify-center text-white font-bold mr-2">
            A
          </div>
          <span className="font-bold text-lg text-gray-900">AdvantageHCS</span>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <a className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-red-50 text-red-700" 
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}>
                  <item.icon className={cn("w-5 h-5", isActive ? "text-red-600" : "text-gray-400")} />
                  {item.label}
                </a>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-800 font-bold border border-red-200">
              {user?.name?.charAt(0) || "A"}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            onClick={() => logout()}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-64 pb-16 md:pb-0 transition-all duration-200">
        {/* Mobile Header - Visible only on Mobile */}
        <header className="md:hidden bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-red-800 rounded-lg flex items-center justify-center text-white font-bold">
              A
            </div>
            <span className="font-bold text-lg text-gray-900">AdvantageHCS</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => logout()}>
            <LogOut className="w-5 h-5 text-gray-500" />
          </Button>
        </header>

        <main className="flex-1 p-4 md:p-8 overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation - Visible only on Mobile */}
      <div className="md:hidden">
        <MobileNav />
      </div>
    </div>
  );
}
