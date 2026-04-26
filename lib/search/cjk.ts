export function normalizeSearchText(value: unknown): string {
    if (Array.isArray(value)) {
        return value.map(normalizeSearchText).filter(Boolean).join(" ");
    }
    if (value === null || value === undefined) return "";
    return String(value).normalize("NFKC").toLowerCase();
}

function isCjk(char: string): boolean {
    return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char);
}

export function cjkBigrams(text: string): string[] {
    const chars = Array.from(normalizeSearchText(text)).filter(isCjk);
    if (chars.length === 0) return [];
    if (chars.length === 1) return chars;

    const grams = new Set<string>();
    for (let i = 0; i < chars.length - 1; i++) {
        grams.add(chars[i] + chars[i + 1]);
    }
    return Array.from(grams);
}

export function buildSearchText(...values: unknown[]): string {
    const normalized = values.map(normalizeSearchText).filter(Boolean);
    const grams = cjkBigrams(normalized.join(" "));
    return [...normalized, ...grams].join(" ").trim();
}

export function buildSearchQuery(query: string): string {
    const normalized = normalizeSearchText(query).replace(/['"]/g, "").trim();
    const terms = normalized.split(/\s+/).filter(Boolean);
    const grams = cjkBigrams(normalized);
    return Array.from(new Set([...terms, ...grams]))
        .map((term) => `"${term.replace(/"/g, "")}"`)
        .join(" OR ");
}
