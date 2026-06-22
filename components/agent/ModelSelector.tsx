"use client";

/**
 * ModelSelector — the header "model button" + popover.
 *
 * Renders a compact trigger (`Provider · model` + readiness dot) that opens
 * a self-contained popover for switching provider, picking a model, and —
 * only when the chosen provider has no server key — entering an API key that
 * is remembered for the browser session (see useAgentSettings / storage).
 *
 * Self-contained popover: native focusable controls, click-outside + Escape
 * to close, no extra dependency or portal so it composes cleanly inside other
 * popovers/headers. The model dropdown is a native <select> with explicit
 * background/text colors (correct on Windows dark mode) plus a free-text
 * "custom model" escape hatch so new model ids work without a code change.
 */

import { useEffect, useId, useRef, useState } from "react";
import {
    ChevronDown,
    Check,
    AlertTriangle,
    KeyRound,
    ExternalLink,
    X,
} from "lucide-react";
import { PROVIDER_CATALOG, PROVIDER_ORDER } from "@/lib/agent/providers/catalog";
import type { AgentSettings } from "@/lib/agent/useAgentSettings";
import { useLanguage } from "@/components/common/LanguageProvider";

const CUSTOM_VALUE = "__custom__";

interface ModelSelectorProps {
    settings: AgentSettings;
    /** Controlled open state (optional). */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Panel horizontal alignment relative to the trigger. */
    align?: "start" | "end";
    className?: string;
}

export function ModelSelector({
    settings,
    open: openProp,
    onOpenChange,
    align = "end",
    className = "",
}: ModelSelectorProps) {
    const { t } = useLanguage();
    const containerRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const panelId = useId();

    const [internalOpen, setInternalOpen] = useState(false);
    const open = openProp ?? internalOpen;
    const setOpen = (next: boolean) => {
        onOpenChange?.(next);
        if (openProp === undefined) setInternalOpen(next);
    };

    const { provider, model, envKeys, needsKey, configLoaded } = settings;
    const meta = PROVIDER_CATALOG[provider];

    // Custom-model escape hatch.
    const isKnownModel = meta.models.some((m) => m.id === model);
    const [customOpen, setCustomOpen] = useState(false);
    const showCustomInput = customOpen || !isKnownModel;

    // API-key editing.
    const hasSessionKey = Boolean(settings.apiKey.trim());
    const [keyEditing, setKeyEditing] = useState(false);
    const [keyDraft, setKeyDraft] = useState("");
    const [justSaved, setJustSaved] = useState(false);
    const showKeyInput = keyEditing || needsKey;

    // Reset transient per-provider UI when provider changes.
    useEffect(() => {
        setCustomOpen(false);
        setKeyEditing(false);
        setKeyDraft("");
        setJustSaved(false);
    }, [provider]);

    // Close on outside click / Escape.
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Move focus into the panel when it opens.
    useEffect(() => {
        if (open) panelRef.current?.focus();
    }, [open]);

    const dotClass = !configLoaded
        ? "bg-muted-foreground/40"
        : needsKey
            ? "bg-amber-500"
            : "bg-emerald-500";

    const saveKey = () => {
        settings.setApiKey(keyDraft);
        setKeyEditing(false);
        setKeyDraft("");
        setJustSaved(true);
    };

    const clearKey = () => {
        settings.setApiKey("");
        setKeyEditing(false);
        setKeyDraft("");
        setJustSaved(false);
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                aria-label={t("model.openSettings")}
                className="inline-flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-lg border border-border bg-background/70 text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
                <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
                <span className="font-medium">{meta.label}</span>
                <span className="text-muted-foreground hidden sm:inline max-w-[160px] truncate" translate="no">
                    {model}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            </button>

            {open && (
                <div
                    id={panelId}
                    ref={panelRef}
                    role="dialog"
                    aria-label={t("model.title")}
                    tabIndex={-1}
                    className={`absolute z-50 mt-2 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover text-popover-foreground shadow-xl p-3.5 focus:outline-none animate-in fade-in zoom-in-95 duration-150 ${
                        align === "end" ? "right-0" : "left-0"
                    }`}
                >
                    <div className="flex items-center justify-between mb-2.5">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {t("model.title")}
                        </h3>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label={t("model.close")}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                    </div>

                    {/* Provider pills */}
                    <p className="text-[11px] font-medium text-muted-foreground mb-1.5">{t("model.provider")}</p>
                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                        {PROVIDER_ORDER.map((p) => {
                            const pMeta = PROVIDER_CATALOG[p];
                            const active = p === provider;
                            const ready = envKeys[p];
                            return (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => settings.setProvider(p)}
                                    aria-pressed={active}
                                    className={`flex items-center justify-between gap-1.5 px-2.5 h-8 rounded-lg border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                                        active
                                            ? "border-primary bg-primary/10 text-primary font-medium"
                                            : "border-border bg-background text-foreground hover:bg-accent"
                                    }`}
                                >
                                    <span className="truncate">{pMeta.label}</span>
                                    <span
                                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                            ready ? "bg-emerald-500" : "bg-amber-500"
                                        }`}
                                        aria-hidden="true"
                                    />
                                </button>
                            );
                        })}
                    </div>

                    {/* Model */}
                    <label
                        htmlFor={`${panelId}-model`}
                        className="block text-[11px] font-medium text-muted-foreground mb-1.5"
                    >
                        {t("model.model")}
                    </label>
                    <select
                        id={`${panelId}-model`}
                        value={showCustomInput ? CUSTOM_VALUE : model}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val === CUSTOM_VALUE) {
                                setCustomOpen(true);
                            } else {
                                setCustomOpen(false);
                                settings.setModel(val);
                            }
                        }}
                        className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        style={{ colorScheme: "light dark" }}
                    >
                        {meta.models.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.label}
                                {m.note ? ` · ${m.note}` : ""}
                            </option>
                        ))}
                        <option value={CUSTOM_VALUE}>{t("model.customModel")}</option>
                    </select>
                    {showCustomInput && (
                        <input
                            type="text"
                            value={model}
                            translate="no"
                            spellCheck={false}
                            autoComplete="off"
                            onChange={(e) => settings.setModel(e.target.value)}
                            placeholder={t("model.customModelPlaceholder")}
                            aria-label={t("model.customModel")}
                            className="mt-1.5 w-full h-9 px-2.5 text-sm rounded-md border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        />
                    )}

                    {/* Base URL — OpenAI-compatible only */}
                    {meta.baseUrlEditable && (
                        <div className="mt-3">
                            <label
                                htmlFor={`${panelId}-baseurl`}
                                className="block text-[11px] font-medium text-muted-foreground mb-1.5"
                            >
                                {t("model.baseUrl")}
                            </label>
                            <input
                                id={`${panelId}-baseurl`}
                                type="url"
                                inputMode="url"
                                value={settings.baseUrl}
                                translate="no"
                                spellCheck={false}
                                autoComplete="off"
                                onChange={(e) => settings.setBaseUrl(e.target.value)}
                                placeholder={meta.defaultBaseUrl}
                                className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                            />
                        </div>
                    )}

                    {/* API key / readiness */}
                    <div className="mt-3 pt-3 border-t border-border/60">
                        {showKeyInput ? (
                            <div>
                                <label
                                    htmlFor={`${panelId}-key`}
                                    className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 mb-1.5"
                                >
                                    <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                                    {t("model.needsKey")}
                                </label>
                                <div className="flex items-center gap-1.5">
                                    <input
                                        id={`${panelId}-key`}
                                        type="password"
                                        value={keyDraft}
                                        translate="no"
                                        spellCheck={false}
                                        autoComplete="off"
                                        onChange={(e) => setKeyDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && keyDraft.trim()) {
                                                e.preventDefault();
                                                saveKey();
                                            }
                                        }}
                                        placeholder={t("model.apiKeyPlaceholder")}
                                        className="flex-1 min-w-0 h-9 px-2.5 text-sm rounded-md border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                    />
                                    <button
                                        type="button"
                                        onClick={saveKey}
                                        disabled={!keyDraft.trim()}
                                        className="h-9 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                    >
                                        {t("model.save")}
                                    </button>
                                </div>
                                <div className="flex items-center justify-between mt-1.5">
                                    <a
                                        href={meta.apiKeyUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                                    >
                                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                        {t("model.getKey")}
                                    </a>
                                    {(hasSessionKey || keyEditing) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setKeyEditing(false);
                                                setKeyDraft("");
                                            }}
                                            className="text-[11px] text-muted-foreground hover:text-foreground"
                                        >
                                            {t("model.close")}
                                        </button>
                                    )}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1.5">{t("model.keyHint")}</p>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                    {hasSessionKey ? (
                                        <KeyRound className="w-3 h-3" aria-hidden="true" />
                                    ) : (
                                        <Check className="w-3 h-3" aria-hidden="true" />
                                    )}
                                    {hasSessionKey ? t("model.saved") : t("model.serverKeyReady")}
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setKeyEditing(true);
                                            setKeyDraft("");
                                        }}
                                        className="text-[11px] text-muted-foreground hover:text-foreground"
                                    >
                                        {t("model.changeKey")}
                                    </button>
                                    {hasSessionKey && (
                                        <button
                                            type="button"
                                            onClick={clearKey}
                                            className="text-[11px] text-muted-foreground hover:text-destructive"
                                        >
                                            {t("model.clearKey")}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                        <span className="sr-only" role="status" aria-live="polite">
                            {justSaved ? t("model.saved") : ""}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
