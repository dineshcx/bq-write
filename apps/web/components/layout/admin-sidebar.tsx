"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Database, LayoutDashboard, AppWindow, Users, LogOut, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

const navItems = [
  { href: "/s-admin/apps", label: "Apps", icon: AppWindow, roles: ["admin", "superadmin"] },
  { href: "/s-admin", label: "Users", icon: Users, roles: ["superadmin"], exact: true },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const session = useAuth();
  const { role, user } = session;
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  const roleColors: Record<string, string> = {
    superadmin: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/60 dark:text-purple-300 dark:border-purple-800",
    admin: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/60 dark:text-blue-300 dark:border-blue-800",
    member: "bg-muted text-muted-foreground border-border",
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex flex-col w-60 border-r border-border bg-card">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted border border-border">
          <Database className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">bq-write</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">admin</Badge>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems
          .filter((item) => item.roles.includes(role))
          .map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
      </nav>

      {/* Back to app */}
      <div className="px-2 pb-2">
        <Link
          href="/apps"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
          My apps
        </Link>
      </div>

      {/* User section */}
      <div className="border-t border-border p-3 space-y-2 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-1">
          <Avatar className="h-7 w-7 flex-shrink-0">
            <AvatarFallback className="text-xs bg-muted text-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{user?.name ?? user?.email}</p>
            <span className={cn("inline-flex items-center px-1.5 py-0 rounded text-[10px] border font-medium", roleColors[role])}>
              {role}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {mounted && (
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {isDark ? "Light" : "Dark"}
            </button>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
