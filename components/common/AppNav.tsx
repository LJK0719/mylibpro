"use client";

import Link from "next/link";
import { Bot, BookOpen } from "lucide-react";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { LanguageToggle } from "@/components/common/LanguageToggle";
import { useLanguage } from "@/components/common/LanguageProvider";

export function AppNav() {
  const { t } = useLanguage();

  return (
    <nav className="sticky top-0 z-50 nav-bar">
      <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/15 transition-all">
            <BookOpen className="w-[18px] h-[18px] text-primary" />
          </div>
          <span className="text-base font-semibold gradient-text tracking-tight">
            LibPro
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/agent"
            className="nav-link flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-primary/10 hover:text-primary"
          >
            <Bot className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("nav.agent")}</span>
          </Link>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
