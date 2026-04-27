/**
 * LLM-backed bilingual sync for tag arrays (authors / discipline / subdiscipline / keywords).
 *
 * The detail page edits one base array at a time. Items that survive the edit keep
 * their previously stored translation; only newly added or never-translated items
 * need an LLM call. We detect those, ask the configured agent provider for the
 * missing locale in a single batched JSON request, and return zh/en aligned to the
 * input array.
 */

import type { ThinkingLevel } from "@google/genai";
import {
    createGeminiClient,
    normalizeOpenAIBaseUrl,
    resolveAgentConfig,
} from "./providers";

export type TagFieldKind = "authors" | "discipline" | "subdiscipline" | "keywords";

export interface AgentRequestOverrides {
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
}

const ZH_RE = /[㐀-鿿]/;

function detectLocale(value: string): "zh" | "en" {
    return ZH_RE.test(value) ? "zh" : "en";
}

function fieldGuidance(kind: TagFieldKind): string {
    switch (kind) {
        case "authors":
            return "Personal names (book or paper authors). Transliterate Chinese names to pinyin (Family Given) for English; for English names, write the Chinese transliteration in pinyin or the established Chinese form if widely known.";
        case "discipline":
            return "Top-level academic disciplines, e.g. \"Mathematics\" / \"数学\", \"Computer Science\" / \"计算机科学\". Use the canonical academic name in each language.";
        case "subdiscipline":
            return "Academic subdisciplines, e.g. \"Mathematical Statistics\" / \"数理统计\", \"Stochastic Analysis in Finance\" / \"金融随机分析\". Use the canonical academic term in each language.";
        case "keywords":
            return "Concise topical keywords. Translate using the most common term used in academic literature.";
    }
}

function buildPrompt(kind: TagFieldKind, items: { value: string; sourceLocale: "zh" | "en" }[]): string {
    const lines = items.map((item, idx) =>
        `${idx + 1}. (${item.sourceLocale === "zh" ? "Chinese" : "English"} source) "${item.value}"`
    );
    return [
        `You are translating ${kind} tags for an academic library.`,
        `Guidance: ${fieldGuidance(kind)}`,
        ``,
        `For each item below, return both the Chinese (zh) and English (en) form.`,
        `If the source is already in one language, translate to the other; if a term has`,
        `an established bilingual academic equivalent, use it. Do not paraphrase or expand.`,
        ``,
        `Items:`,
        ...lines,
        ``,
        `Return ONLY a JSON array of length ${items.length}, in the same order, with shape:`,
        `[{"zh": "...", "en": "..."}, ...]`,
        `No prose, no markdown fences.`,
    ].join("\n");
}

function stripJsonFence(raw: string): string {
    return raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
}

async function callJsonModel(input: AgentRequestOverrides & { prompt: string; system: string }): Promise<string> {
    const config = resolveAgentConfig(input);
    if (!config.apiKey || !config.model) {
        throw new Error("Translation requires an LLM API key and model.");
    }

    if (config.provider === "openai") {
        const baseUrl = normalizeOpenAIBaseUrl(config.baseUrl || "https://api.openai.com/v1");
        const res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: "system", content: input.system },
                    { role: "user", content: input.prompt },
                ],
                response_format: { type: "json_object" },
            }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Translation API error ${res.status}: ${text}`);
        }
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (typeof text !== "string" || !text.trim()) {
            throw new Error("Translation API returned no text.");
        }
        return text.trim();
    }

    const ai = createGeminiClient(config.apiKey);
    const response = await ai.models.generateContent({
        model: config.model,
        contents: [{ role: "user", parts: [{ text: input.prompt }] }],
        config: {
            systemInstruction: input.system,
            thinkingConfig: { thinkingLevel: "low" as ThinkingLevel },
            responseMimeType: "application/json",
        },
    });
    const text = response.text;
    if (!text?.trim()) {
        throw new Error("Gemini API returned no text.");
    }
    return text.trim();
}

function parseTranslationResult(raw: string, expected: number): { zh: string; en: string }[] | null {
    try {
        let parsed = JSON.parse(stripJsonFence(raw)) as unknown;
        // Some providers wrap arrays inside a top-level object — unwrap if so.
        if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
            const obj = parsed as Record<string, unknown>;
            const firstArray = Object.values(obj).find((v) => Array.isArray(v));
            if (Array.isArray(firstArray)) parsed = firstArray;
        }
        if (!Array.isArray(parsed) || parsed.length !== expected) return null;
        return parsed.map((entry) => {
            const obj = (entry || {}) as Record<string, unknown>;
            return {
                zh: typeof obj.zh === "string" ? obj.zh.trim() : "",
                en: typeof obj.en === "string" ? obj.en.trim() : "",
            };
        });
    } catch {
        return null;
    }
}

/**
 * Resolve the bilingual form of `base` items, preserving any prior translations
 * passed in via `existingZh` / `existingEn`. For items where the prior locale
 * value is missing or equal to the base value (i.e. never translated), the LLM
 * fills in the missing side. On any failure we fall back to the input value
 * itself for both locales — never block the user's edit.
 */
export async function syncBilingualTags(opts: {
    kind: TagFieldKind;
    base: string[];
    existingZh: string[];
    existingEn: string[];
    overrides?: AgentRequestOverrides;
}): Promise<{ zh: string[]; en: string[]; translated: number; error?: string }> {
    const { kind, base, existingZh, existingEn, overrides } = opts;

    const zh: string[] = [];
    const en: string[] = [];
    const pending: { index: number; value: string; sourceLocale: "zh" | "en" }[] = [];

    for (let i = 0; i < base.length; i++) {
        const value = base[i];
        const priorZh = existingZh[i] && existingZh[i] !== value ? existingZh[i] : "";
        const priorEn = existingEn[i] && existingEn[i] !== value ? existingEn[i] : "";
        zh.push(priorZh);
        en.push(priorEn);

        const sourceLocale = detectLocale(value);
        // Already filled on the source side — only the other locale needs work.
        const needsZh = !priorZh && sourceLocale !== "zh";
        const needsEn = !priorEn && sourceLocale !== "en";

        // Seed the source-locale slot with the value itself so we always have something.
        if (sourceLocale === "zh" && !priorZh) zh[i] = value;
        if (sourceLocale === "en" && !priorEn) en[i] = value;

        if (needsZh || needsEn) {
            pending.push({ index: i, value, sourceLocale });
        }
    }

    if (pending.length === 0) {
        return {
            zh: zh.map((v, i) => v || base[i]),
            en: en.map((v, i) => v || base[i]),
            translated: 0,
        };
    }

    try {
        const raw = await callJsonModel({
            ...overrides,
            system: "You are a precise bilingual academic terminology translator. You must reply with valid JSON only.",
            prompt: buildPrompt(kind, pending.map((p) => ({ value: p.value, sourceLocale: p.sourceLocale }))),
        });
        const parsed = parseTranslationResult(raw, pending.length);
        if (!parsed) {
            return {
                zh: zh.map((v, i) => v || base[i]),
                en: en.map((v, i) => v || base[i]),
                translated: 0,
                error: "Could not parse translation result.",
            };
        }

        for (let k = 0; k < pending.length; k++) {
            const { index } = pending[k];
            const result = parsed[k];
            if (result.zh) zh[index] = result.zh;
            if (result.en) en[index] = result.en;
        }

        return {
            zh: zh.map((v, i) => v || base[i]),
            en: en.map((v, i) => v || base[i]),
            translated: pending.length,
        };
    } catch (err) {
        return {
            zh: zh.map((v, i) => v || base[i]),
            en: en.map((v, i) => v || base[i]),
            translated: 0,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
