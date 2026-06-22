export type Language = "en" | "zh";

export interface LocalizedText {
  en: string;
  zh: string;
}

export interface LocalizedStringArray {
  en: string[];
  zh: string[];
}

export interface DocumentMetadataI18n {
  title: LocalizedText;
  authors: LocalizedStringArray;
  discipline: LocalizedStringArray;
  subdiscipline: LocalizedStringArray;
  keywords: LocalizedStringArray;
  abstract: LocalizedText;
  toc: LocalizedText;
}

const ZH_RE = /[\u3400-\u9fff]/;

const DISCIPLINE_TRANSLATIONS: Record<string, LocalizedText> = {
  "数学": { en: "Mathematics", zh: "数学" },
  "统计": { en: "Statistics", zh: "统计学" },
  "统计学": { en: "Statistics", zh: "统计学" },
  "数理统计": { en: "Mathematical Statistics", zh: "数理统计" },
  "概率论与随机过程": { en: "Probability and Stochastic Processes", zh: "概率论与随机过程" },
  "机器学习": { en: "Machine Learning", zh: "机器学习" },
  "人工智能": { en: "Artificial Intelligence", zh: "人工智能" },
  "计算机科学": { en: "Computer Science", zh: "计算机科学" },
  "经济学": { en: "Economics", zh: "经济学" },
  "量化金融": { en: "Quantitative Finance", zh: "量化金融" },
  "金融学": { en: "Finance", zh: "金融学" },
  "资产定价理论": { en: "Asset Pricing Theory", zh: "资产定价理论" },
  "衍生品与波动率建模": { en: "Derivatives and Volatility Modeling", zh: "衍生品与波动率建模" },
  "金融随机分析": { en: "Financial Stochastic Analysis", zh: "金融随机分析" },
  mathematics: { en: "Mathematics", zh: "数学" },
  statistics: { en: "Statistics", zh: "统计学" },
  "machine learning": { en: "Machine Learning", zh: "机器学习" },
  finance: { en: "Finance", zh: "金融学" },
  economics: { en: "Economics", zh: "经济学" },
};

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parseStringArray(parsed);
    } catch {
      return value.trim() ? [value.trim()] : [];
    }
  }
  return [];
}

function translateLabel(label: string): LocalizedText {
  const direct = DISCIPLINE_TRANSLATIONS[label] || DISCIPLINE_TRANSLATIONS[label.toLowerCase()];
  if (direct) return direct;
  return ZH_RE.test(label) ? { en: label, zh: label } : { en: label, zh: label };
}

function localizedArrayFrom(
  source: unknown,
  enSource?: unknown,
  zhSource?: unknown,
  translateKnown = false
): LocalizedStringArray {
  const base = parseStringArray(source);
  const explicitEn = parseStringArray(enSource);
  const explicitZh = parseStringArray(zhSource);

  if (!base.length) {
    return { en: explicitEn, zh: explicitZh };
  }

  const en = base.map((item, index) =>
    explicitEn.length === base.length && explicitEn[index]
      ? explicitEn[index]
      : translateKnown
        ? translateLabel(item).en
        : item
  );
  const zh = base.map((item, index) =>
    explicitZh.length === base.length && explicitZh[index]
      ? explicitZh[index]
      : translateKnown
        ? translateLabel(item).zh
        : item
  );

  return { en, zh };
}

export function localizedTextFrom(source: unknown, enSource?: unknown, zhSource?: unknown): LocalizedText {
  const raw = firstString(source);
  return {
    en: firstString(enSource, !ZH_RE.test(raw) ? raw : "", raw),
    zh: firstString(zhSource, ZH_RE.test(raw) ? raw : "", raw),
  };
}

export function normalizeMetadataI18n(meta: Record<string, unknown>): DocumentMetadataI18n {
  const titleI18n = (meta.title_i18n || {}) as Record<string, unknown>;
  const authorsI18n = (meta.authors_i18n || {}) as Record<string, unknown>;
  const disciplineI18n = (meta.discipline_i18n || {}) as Record<string, unknown>;
  const subdisciplineI18n = (meta.subdiscipline_i18n || {}) as Record<string, unknown>;
  const keywordsI18n = (meta.keywords_i18n || {}) as Record<string, unknown>;
  const abstractI18n = (meta.abstract_i18n || {}) as Record<string, unknown>;
  const tocI18n = (meta.toc_i18n || {}) as Record<string, unknown>;

  return {
    title: localizedTextFrom(meta.title, meta.title_en ?? titleI18n.en, meta.title_zh ?? titleI18n.zh),
    authors: localizedArrayFrom(meta.authors, meta.authors_en ?? authorsI18n.en, meta.authors_zh ?? authorsI18n.zh),
    discipline: localizedArrayFrom(meta.discipline, meta.discipline_en ?? disciplineI18n.en, meta.discipline_zh ?? disciplineI18n.zh, true),
    subdiscipline: localizedArrayFrom(meta.subdiscipline, meta.subdiscipline_en ?? subdisciplineI18n.en, meta.subdiscipline_zh ?? subdisciplineI18n.zh, true),
    keywords: localizedArrayFrom(meta.keywords, meta.keywords_en ?? keywordsI18n.en, meta.keywords_zh ?? keywordsI18n.zh),
    abstract: localizedTextFrom(meta.abstract, meta.abstract_en ?? abstractI18n.en, meta.abstract_zh ?? abstractI18n.zh),
    toc: localizedTextFrom(meta.toc, meta.toc_en ?? tocI18n.en, meta.toc_zh ?? tocI18n.zh),
  };
}

export function pickText(value: LocalizedText | undefined, language: Language, fallback = ""): string {
  if (!value) return fallback;
  return value[language] || value.en || value.zh || fallback;
}

export function pickArray(value: LocalizedStringArray | undefined, language: Language, fallback: string[] = []): string[] {
  if (!value) return fallback;
  return value[language]?.length ? value[language] : value.en.length ? value.en : value.zh.length ? value.zh : fallback;
}
