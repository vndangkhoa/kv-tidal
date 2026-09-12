"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, Search, Library, FolderArchive, Settings } from "lucide-react";
import { Logo } from "@/components/Logo";

export function Navigation() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Trending", icon: Flame },
    { href: "/search/", label: "Search", icon: Search },
    { href: "/library/", label: "NAS Library", icon: Library },
    { href: "/files/", label: "NAS Files", icon: FolderArchive },
    { href: "/settings/", label: "Settings", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-3 group">
          <div className="w-9 h-9 rounded-lg bg-surface border border-border flex items-center justify-center group-hover:scale-105 group-hover:border-primary/50 transition-all shadow-sm">
            <Logo className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-lg tracking-wider text-textPrimary group-hover:text-primary transition-colors">KV-TIDAL</span>
            <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/20 text-primary rounded border border-primary/40">
              LOSSLESS
            </span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center space-x-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-card text-primary border border-primary/30"
                    : "text-textSecondary hover:text-textPrimary hover:bg-card/50"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Mobile quick links */}
        <div className="flex md:hidden items-center space-x-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`p-2 rounded-lg ${
                  isActive ? "text-primary bg-card" : "text-textSecondary"
                }`}
                title={item.label}
              >
                <Icon className="w-5 h-5" />
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
