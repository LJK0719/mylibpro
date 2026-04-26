const DISCIPLINE_ALIASES: Record<string, string[]> = {
    statistics: ["统计", "统计学", "数理统计", "statistical science"],
    "machine learning": ["机器学习", "ml", "artificial intelligence", "ai", "人工智能"],
    mathematics: ["数学", "math"],
    economics: ["经济", "经济学", "economy"],
    finance: ["金融", "金融学"],
    sociology: ["社会学"],
    psychology: ["心理", "心理学"],
    philosophy: ["哲学"],
    history: ["历史", "历史学"],
    literature: ["文学"],
    linguistics: ["语言学"],
    computer_science: ["computer science", "cs", "计算机", "计算机科学"],
};

const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(DISCIPLINE_ALIASES)) {
    ALIAS_TO_CANONICAL.set(canonical, canonical);
    for (const alias of aliases) {
        ALIAS_TO_CANONICAL.set(alias.toLowerCase(), canonical);
    }
}

export function normalizeDisciplineLabel(label: string): string {
    const normalized = label.trim().normalize("NFKC").toLowerCase();
    return ALIAS_TO_CANONICAL.get(normalized) || normalized;
}

export function disciplineSearchTerms(label: unknown): string[] {
    const rawLabel = String(label || "");
    const canonical = normalizeDisciplineLabel(rawLabel);
    const terms = new Set<string>([rawLabel, canonical]);
    for (const alias of DISCIPLINE_ALIASES[canonical] || []) {
        terms.add(alias);
    }
    return Array.from(terms).filter(Boolean);
}

export function expandDisciplineForSearch(label: unknown): string {
    return disciplineSearchTerms(label).join(" ");
}
