"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LogOut, Settings, ChevronDown, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface UserNavProps {
  email?: string | null;
  name?: string | null;
  role?: string;
  showAdminLink?: boolean;
}

export function UserNav({ email, name, role, showAdminLink }: UserNavProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  useEffect(() => setMounted(true), []);

  const initials = name
    ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : email?.[0]?.toUpperCase() ?? "?";

  const adminHref = role === "superadmin" ? "/s-admin" : "/s-admin/apps";
  const isDark = resolvedTheme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors outline-none">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-xs bg-muted text-foreground">{initials}</AvatarFallback>
        </Avatar>
        <div className="hidden sm:flex flex-col items-start">
          <span className="text-xs font-medium leading-none">{name ?? email}</span>
          {role && role !== "member" && (
            <Badge variant="secondary" className="mt-0.5 text-[10px] px-1 py-0 h-4 leading-none">
              {role}
            </Badge>
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-0.5">
              <p className="text-sm font-medium">{name ?? "User"}</p>
              <p className="text-xs text-muted-foreground truncate">{email}</p>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        {/* Theme toggle */}
        {mounted && (
          <DropdownMenuItem onClick={() => setTheme(isDark ? "light" : "dark")} className="cursor-pointer">
            {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            {isDark ? "Light mode" : "Dark mode"}
          </DropdownMenuItem>
        )}

        {showAdminLink && (
          <DropdownMenuItem onClick={() => router.push(adminHref)} className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            Admin panel
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive cursor-pointer"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
