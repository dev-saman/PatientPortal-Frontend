import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Settings 
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function MobileNav() {
  const [location] = useLocation();

  const navItems = [
    { icon: LayoutDashboard, label: "Home", href: "/admin" },
    { icon: Users, label: "Users", href: "/admin/users" },
    { icon: FileText, label: "Reports", href: "/admin/reports" },
    { icon: Settings, label: "Settings", href: "/admin/settings" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 pb-safe md:hidden">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <a className={cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1",
                isActive ? "text-red-600" : "text-gray-500 hover:text-gray-900"
              )}>
                <item.icon className={cn("w-6 h-6", isActive && "fill-current/10")} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </a>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
