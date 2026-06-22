import { getDb, recordToView, type DocumentRecord } from "../db";
import { buildSearchQuery, buildSearchText } from "../search/cjk";
import { disciplineSearchTerms, expandDisciplineForSearch } from "../search/disciplines";
import type { DocumentView } from "../types/library";
import { normalizeMetadataI18n, parseStringArray } from "../i18n";

export interface ListDocumentsInput {
    q: string;
    type: string;
    discipline: string;
    subdiscipline: string;
    yearFrom: number | null;
    yearTo: number | null;
    favorite: string;
    statusFilter: string;
    shelf: string;
    page: number;
    pageSize: number;
    sort: string;
}

export interface ListDocumentsResult {
    documents: DocumentView[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export function getDocumentById(id: string): DocumentRecord | undefined {
    return getDb()
        .prepare(`SELECT * FROM documents WHERE document_id = ?`)
        .get(id) as DocumentRecord | undefined;
}

export function getDocumentViewById(id: string): DocumentView | undefined {
    const row = getDocumentById(id);
    return row ? recordToView(row) : undefined;
}

export function listDocuments(input: ListDocumentsInput): ListDocumentsResult {
    const db = getDb();
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (input.q.trim()) {
        const escaped = buildSearchQuery(input.q);
        if (escaped) {
            conditions.push(
                `d.document_id IN (SELECT document_id FROM documents_fts WHERE documents_fts MATCH @q)`
            );
            params.q = escaped;
        }
    }

    if (input.type) {
        conditions.push(`d.type = @type`);
        params.type = input.type;
    }

    if (input.discipline) {
        const disciplineClauses = disciplineSearchTerms(input.discipline).map((term, index) => {
            const key = `discipline${index}`;
            params[key] = `%${term}%`;
            return `(d.discipline LIKE @${key} OR d.discipline_zh LIKE @${key} OR d.discipline_en LIKE @${key})`;
        });
        conditions.push(`(${disciplineClauses.join(" OR ")})`);
    }

    if (input.subdiscipline) {
        conditions.push(`(d.subdiscipline LIKE @subdiscipline OR d.subdiscipline_zh LIKE @subdiscipline OR d.subdiscipline_en LIKE @subdiscipline)`);
        params.subdiscipline = `%${input.subdiscipline}%`;
    }

    if (input.yearFrom !== null) {
        conditions.push(`d.year >= @yearFrom`);
        params.yearFrom = input.yearFrom;
    }
    if (input.yearTo !== null) {
        conditions.push(`d.year <= @yearTo`);
        params.yearTo = input.yearTo;
    }
    if (input.favorite === "1") {
        conditions.push(`d.is_favorite = 1`);
    }
    if (input.statusFilter) {
        conditions.push(`d.status = @statusFilter`);
        params.statusFilter = input.statusFilter;
    }
    if (input.shelf) {
        conditions.push(`d.shelves LIKE @shelf`);
        params.shelf = `%${input.shelf}%`;
    }

    const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    let orderClause = "ORDER BY d.year DESC, d.title ASC";
    switch (input.sort) {
        case "year_asc":
            orderClause = "ORDER BY d.year ASC, d.title ASC";
            break;
        case "year_desc":
            orderClause = "ORDER BY d.year DESC, d.title ASC";
            break;
        case "title_asc":
            orderClause = "ORDER BY d.title ASC";
            break;
        case "title_desc":
            orderClause = "ORDER BY d.title DESC";
            break;
        case "token_desc":
            orderClause = "ORDER BY d.token_count DESC";
            break;
    }

    const countRow = db
        .prepare(`SELECT COUNT(*) as total FROM documents d ${whereClause}`)
        .get(params) as { total: number };
    const total = countRow.total;

    const offset = (input.page - 1) * input.pageSize;
    const rows = db
        .prepare(
            `SELECT d.* FROM documents d ${whereClause} ${orderClause} LIMIT @limit OFFSET @offset`
        )
        .all({ ...params, limit: input.pageSize, offset }) as DocumentRecord[];

    return {
        documents: rows.map(recordToView),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
    };
}

export interface DocumentPatchInput {
    authors?: unknown;
    authors_zh?: unknown;
    authors_en?: unknown;
    abstract?: unknown;
    toc?: unknown;
    remark?: unknown;
    status?: unknown;
    is_favorite?: unknown;
    discipline?: unknown;
    discipline_zh?: unknown;
    discipline_en?: unknown;
    subdiscipline?: unknown;
    subdiscipline_zh?: unknown;
    subdiscipline_en?: unknown;
    keywords?: unknown;
    keywords_zh?: unknown;
    keywords_en?: unknown;
    shelves?: unknown;
}

function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
}

// Re-align stored localized arrays after a base array edit. Items that survive in
// the new base keep their previously stored translation (matched by value, not index,
// so reordering is safe); newly added items default to the value itself for both locales.
function realignI18nArrays(
    newBase: string[],
    oldBaseJson: string,
    oldZhJson: string,
    oldEnJson: string,
): { zh: string[]; en: string[] } {
    const oldBase = parseStringArray(oldBaseJson);
    const oldZh = parseStringArray(oldZhJson);
    const oldEn = parseStringArray(oldEnJson);
    const zh: string[] = [];
    const en: string[] = [];
    for (const item of newBase) {
        const idx = oldBase.indexOf(item);
        zh.push(idx >= 0 && oldZh[idx] ? oldZh[idx] : item);
        en.push(idx >= 0 && oldEn[idx] ? oldEn[idx] : item);
    }
    return { zh, en };
}

function queueI18nMetadataUpdates(
    updates: string[],
    values: unknown[],
    metadataI18n: ReturnType<typeof normalizeMetadataI18n>
) {
    updates.push(
        "title_zh = ?",
        "title_en = ?",
        "authors_zh = ?",
        "authors_en = ?",
        "discipline_zh = ?",
        "discipline_en = ?",
        "subdiscipline_zh = ?",
        "subdiscipline_en = ?",
        "keywords_zh = ?",
        "keywords_en = ?",
        "abstract_zh = ?",
        "abstract_en = ?",
        "toc_zh = ?",
        "toc_en = ?"
    );
    values.push(
        metadataI18n.title.zh,
        metadataI18n.title.en,
        JSON.stringify(metadataI18n.authors.zh),
        JSON.stringify(metadataI18n.authors.en),
        JSON.stringify(metadataI18n.discipline.zh),
        JSON.stringify(metadataI18n.discipline.en),
        JSON.stringify(metadataI18n.subdiscipline.zh),
        JSON.stringify(metadataI18n.subdiscipline.en),
        JSON.stringify(metadataI18n.keywords.zh),
        JSON.stringify(metadataI18n.keywords.en),
        metadataI18n.abstract.zh,
        metadataI18n.abstract.en,
        metadataI18n.toc.zh,
        metadataI18n.toc.en
    );
}

export function updateDocumentFields(id: string, input: DocumentPatchInput): void {
    const db = getDb();
    const current = getDocumentById(id);
    if (!current) return;

    const updates: string[] = [];
    const values: unknown[] = [];
    let authors = JSON.parse(current.authors || "[]") as string[];
    let discipline = JSON.parse(current.discipline || "[]") as string[];
    let subdiscipline = JSON.parse(current.subdiscipline || "[]") as string[];
    let keywords = JSON.parse(current.keywords || "[]") as string[];
    let abstract = current.abstract || "";
    let metadataI18n = normalizeMetadataI18n(current as unknown as Record<string, unknown>);
    let shouldRebuildSearchText = false;

    if (input.authors !== undefined) {
        authors = normalizeStringArray(input.authors);
        // Caller-supplied translations take precedence (e.g. LLM-synced); otherwise
        // realign by value-matching against the previous arrays.
        const sync = (input.authors_zh !== undefined || input.authors_en !== undefined)
            ? {
                zh: normalizeStringArray(input.authors_zh ?? []),
                en: normalizeStringArray(input.authors_en ?? []),
            }
            : realignI18nArrays(authors, current.authors, current.authors_zh, current.authors_en);
        metadataI18n = normalizeMetadataI18n({
            ...current,
            authors,
            authors_zh: JSON.stringify(sync.zh),
            authors_en: JSON.stringify(sync.en),
        });
        updates.push("authors = ?");
        values.push(JSON.stringify(authors));
        shouldRebuildSearchText = true;
    }
    if (input.abstract !== undefined) {
        abstract = typeof input.abstract === "string" ? input.abstract : "";
        metadataI18n = normalizeMetadataI18n({ ...current, abstract });
        updates.push("abstract = ?");
        values.push(abstract);
        shouldRebuildSearchText = true;
    }
    if (input.toc !== undefined) {
        updates.push("toc = ?");
        values.push(typeof input.toc === "string" ? input.toc : "");
    }
    if (input.remark !== undefined) {
        updates.push("remark = ?");
        values.push(input.remark);
    }
    if (input.status !== undefined) {
        updates.push("status = ?");
        values.push(input.status);
    }
    if (input.is_favorite !== undefined) {
        updates.push("is_favorite = ?");
        values.push(input.is_favorite ? 1 : 0);
    }
    if (input.discipline !== undefined) {
        discipline = normalizeStringArray(input.discipline);
        const sync = (input.discipline_zh !== undefined || input.discipline_en !== undefined)
            ? {
                zh: normalizeStringArray(input.discipline_zh ?? []),
                en: normalizeStringArray(input.discipline_en ?? []),
            }
            : realignI18nArrays(discipline, current.discipline, current.discipline_zh, current.discipline_en);
        metadataI18n = normalizeMetadataI18n({
            ...current,
            discipline,
            discipline_zh: JSON.stringify(sync.zh),
            discipline_en: JSON.stringify(sync.en),
        });
        updates.push("discipline = ?");
        values.push(JSON.stringify(discipline));
        shouldRebuildSearchText = true;
    }
    if (input.subdiscipline !== undefined) {
        subdiscipline = normalizeStringArray(input.subdiscipline);
        const sync = (input.subdiscipline_zh !== undefined || input.subdiscipline_en !== undefined)
            ? {
                zh: normalizeStringArray(input.subdiscipline_zh ?? []),
                en: normalizeStringArray(input.subdiscipline_en ?? []),
            }
            : realignI18nArrays(subdiscipline, current.subdiscipline, current.subdiscipline_zh, current.subdiscipline_en);
        metadataI18n = normalizeMetadataI18n({
            ...current,
            subdiscipline,
            subdiscipline_zh: JSON.stringify(sync.zh),
            subdiscipline_en: JSON.stringify(sync.en),
        });
        updates.push("subdiscipline = ?");
        values.push(JSON.stringify(subdiscipline));
        shouldRebuildSearchText = true;
    }
    if (input.keywords !== undefined) {
        keywords = normalizeStringArray(input.keywords);
        const sync = (input.keywords_zh !== undefined || input.keywords_en !== undefined)
            ? {
                zh: normalizeStringArray(input.keywords_zh ?? []),
                en: normalizeStringArray(input.keywords_en ?? []),
            }
            : realignI18nArrays(keywords, current.keywords, current.keywords_zh, current.keywords_en);
        metadataI18n = normalizeMetadataI18n({
            ...current,
            keywords,
            keywords_zh: JSON.stringify(sync.zh),
            keywords_en: JSON.stringify(sync.en),
        });
        updates.push("keywords = ?");
        values.push(JSON.stringify(keywords));
        shouldRebuildSearchText = true;
    }
    if (input.shelves !== undefined) {
        updates.push("shelves = ?");
        values.push(JSON.stringify(normalizeStringArray(input.shelves)));
    }
    if (shouldRebuildSearchText) {
        queueI18nMetadataUpdates(updates, values, metadataI18n);
        updates.push("search_text = ?");
        values.push(
            buildSearchText(
                current.title,
                authors,
                keywords,
                [abstract, metadataI18n.abstract.en, metadataI18n.abstract.zh].join(" "),
                expandDisciplineForSearch([...discipline, ...metadataI18n.discipline.en, ...metadataI18n.discipline.zh].join(" ")),
                expandDisciplineForSearch([...subdiscipline, ...metadataI18n.subdiscipline.en, ...metadataI18n.subdiscipline.zh].join(" "))
            )
        );
    }

    if (updates.length > 0) {
        values.push(id);
        db.prepare(`UPDATE documents SET ${updates.join(", ")} WHERE document_id = ?`).run(...values);
    }
}

export interface FilterOption {
    value: string;
    label: {
        en: string;
        zh: string;
    };
}

function localizedFilterKey(label: { en: string; zh: string }): string {
    return `${label.en.trim().toLocaleLowerCase()}|${label.zh.trim().toLocaleLowerCase()}`;
}

export function getDisciplineFilters() {
    const db = getDb();
    const rows = db
        .prepare(`SELECT DISTINCT discipline, discipline_zh, discipline_en, subdiscipline, subdiscipline_zh, subdiscipline_en FROM documents`)
        .all() as {
            discipline: string;
            discipline_zh: string;
            discipline_en: string;
            subdiscipline: string;
            subdiscipline_zh: string;
            subdiscipline_en: string;
        }[];

    const disciplineMap = new Map<string, FilterOption>();
    const subdisciplineMap = new Map<string, FilterOption>();
    for (const row of rows) {
        const i18n = normalizeMetadataI18n(row as unknown as Record<string, unknown>);
        const dArr = parseStringArray(row.discipline);
        for (const [index, d] of dArr.entries()) {
            const label = {
                en: i18n.discipline.en[index] || d,
                zh: i18n.discipline.zh[index] || d,
            };
            const key = localizedFilterKey(label);
            if (!disciplineMap.has(key)) {
                disciplineMap.set(key, {
                    value: label.en || label.zh || d,
                    label,
                });
            }
        }

        const sArr = parseStringArray(row.subdiscipline);
        for (const [index, s] of sArr.entries()) {
            const label = {
                en: i18n.subdiscipline.en[index] || s,
                zh: i18n.subdiscipline.zh[index] || s,
            };
            const key = localizedFilterKey(label);
            if (!subdisciplineMap.has(key)) {
                subdisciplineMap.set(key, {
                    value: label.en || label.zh || s,
                    label,
                });
            }
        }
    }

    const typeRows = db
        .prepare(`SELECT DISTINCT type FROM documents ORDER BY type`)
        .all() as { type: string }[];
    const yearRange = db
        .prepare(`SELECT MIN(year) as minYear, MAX(year) as maxYear FROM documents`)
        .get() as { minYear: number; maxYear: number };

    return {
        disciplines: Array.from(disciplineMap.values()).sort((a, b) => a.label.en.localeCompare(b.label.en)),
        subdisciplines: Array.from(subdisciplineMap.values()).sort((a, b) => a.label.en.localeCompare(b.label.en)),
        types: typeRows.map((r) => r.type),
        yearRange: { min: yearRange.minYear, max: yearRange.maxYear },
    };
}

export function upsertImportedDocuments(records: Record<string, unknown>[]) {
    const db = getDb();
    const upsert = db.prepare(`
        INSERT INTO documents (
          document_id, type, title, title_zh, title_en, authors, authors_zh, authors_en, year,
          discipline, discipline_zh, discipline_en, subdiscipline, subdiscipline_zh, subdiscipline_en,
          keywords, keywords_zh, keywords_en, abstract, abstract_zh, abstract_en, toc, toc_zh, toc_en,
          full_text_path, token_count, indexed_date,
          citation_info, remark, folder_name, status, is_favorite, chapters, search_text
        ) VALUES (
          @document_id, @type, @title, @title_zh, @title_en, @authors, @authors_zh, @authors_en, @year,
          @discipline, @discipline_zh, @discipline_en, @subdiscipline, @subdiscipline_zh, @subdiscipline_en,
          @keywords, @keywords_zh, @keywords_en, @abstract, @abstract_zh, @abstract_en, @toc, @toc_zh, @toc_en,
          @full_text_path, @token_count, @indexed_date,
          @citation_info, @remark, @folder_name, @status, @is_favorite, @chapters, @search_text
        ) ON CONFLICT(document_id) DO UPDATE SET
          type = excluded.type,
          title = excluded.title,
          title_zh = excluded.title_zh,
          title_en = excluded.title_en,
          authors = excluded.authors,
          authors_zh = excluded.authors_zh,
          authors_en = excluded.authors_en,
          year = excluded.year,
          discipline = excluded.discipline,
          discipline_zh = excluded.discipline_zh,
          discipline_en = excluded.discipline_en,
          subdiscipline = excluded.subdiscipline,
          subdiscipline_zh = excluded.subdiscipline_zh,
          subdiscipline_en = excluded.subdiscipline_en,
          keywords = excluded.keywords,
          keywords_zh = excluded.keywords_zh,
          keywords_en = excluded.keywords_en,
          abstract = excluded.abstract,
          abstract_zh = excluded.abstract_zh,
          abstract_en = excluded.abstract_en,
          toc = excluded.toc,
          toc_zh = excluded.toc_zh,
          toc_en = excluded.toc_en,
          full_text_path = excluded.full_text_path,
          token_count = excluded.token_count,
          indexed_date = excluded.indexed_date,
          citation_info = excluded.citation_info,
          remark = excluded.remark,
          folder_name = excluded.folder_name,
          status = excluded.status,
          is_favorite = excluded.is_favorite,
          chapters = excluded.chapters,
          search_text = excluded.search_text
    `);

    const insertMany = db.transaction((rows: Record<string, unknown>[]) => {
        for (const rec of rows) {
            const i18n = normalizeMetadataI18n(rec);
            upsert.run({
                ...rec,
                title_zh: i18n.title.zh,
                title_en: i18n.title.en,
                authors_zh: JSON.stringify(i18n.authors.zh),
                authors_en: JSON.stringify(i18n.authors.en),
                discipline_zh: JSON.stringify(i18n.discipline.zh),
                discipline_en: JSON.stringify(i18n.discipline.en),
                subdiscipline_zh: JSON.stringify(i18n.subdiscipline.zh),
                subdiscipline_en: JSON.stringify(i18n.subdiscipline.en),
                keywords_zh: JSON.stringify(i18n.keywords.zh),
                keywords_en: JSON.stringify(i18n.keywords.en),
                abstract_zh: i18n.abstract.zh,
                abstract_en: i18n.abstract.en,
                toc_zh: i18n.toc.zh,
                toc_en: i18n.toc.en,
                search_text: buildSearchText(
                    [rec.title, i18n.title.en, i18n.title.zh].join(" "),
                    [...i18n.authors.en, ...i18n.authors.zh],
                    [...i18n.keywords.en, ...i18n.keywords.zh],
                    [rec.abstract, i18n.abstract.en, i18n.abstract.zh, i18n.toc.en, i18n.toc.zh].join(" "),
                    expandDisciplineForSearch([...i18n.discipline.en, ...i18n.discipline.zh].join(" ")),
                    expandDisciplineForSearch([...i18n.subdiscipline.en, ...i18n.subdiscipline.zh].join(" "))
                ),
            });
        }
    });

    insertMany(records);
}

export function rebuildDocumentsFts(): void {
    getDb().exec(`INSERT INTO documents_fts(documents_fts) VALUES('rebuild');`);
}
