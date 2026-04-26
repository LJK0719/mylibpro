"use client";

import { Languages } from "lucide-react";
import { useLanguage } from "@/components/common/LanguageProvider";

export function LanguageToggle() {
  const { language, toggleLanguage, t } = useLanguage();

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className="nav-link flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-primary/10 hover:text-primary"
      title={t("language.toggle")}
      aria-label={t("language.toggle")}
    >
      <Languages className="w-3.5 h-3.5" />
      <span>{language === "en" ? t("language.zh") : t("language.en")}</span>
    </button>
  );
}
