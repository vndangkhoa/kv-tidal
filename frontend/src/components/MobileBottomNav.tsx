"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Library, Settings } from "lucide-react";

export function MobileBottomNav() {
  const pathname = usePathname();

  const tabs = [
    { href: "/", label: "Home", icon: Home },
    { href: "/search/", label: "Search", icon: Search },
    { href: "/library/", label: "Collection", icon: Library },
    { href: "/settings/", label: "Settings", icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-black/95 backdrop-blur-xl border-t border-border z-40 flex items-center justify-around pb-safe select-none">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive =
          tab.href === "/"
            ? pathname === "/"
            : pathname === tab.href || pathname?.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
              isActive ? "text-primary font-bold" : "text-textSecondary hover:text-white"
            }`}
          >
            <Icon
              className={`w-5 h-5 transition-transform ${
                isActive ? "scale-110 text-primary" : "text-textSecondary"
              }`}
            />
            <span className="text-[10px] tracking-tight mt-1 font-medium">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
