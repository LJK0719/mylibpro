/**
 * Normalize inconsistent discipline / subdiscipline labels.
 *
 * SAFETY: dry-run by default — prints every change and touches NOTHING.
 * Pass `--confirm` to actually write. Only the 6 label columns
 * (discipline[_zh|_en], subdiscipline[_zh|_en]) and the matching
 * metadata.json fields are updated, and ONLY for documents that actually
 * contain a variant. No other field is touched; nothing is deleted.
 *
 *   npx tsx scripts/normalize-tags.ts                 # dry-run (default)
 *   npx tsx scripts/normalize-tags.ts --confirm       # write
 *
 * Production VPS:
 *   DB_PATH=/opt/mylibpro/db/library.db DATA_ROOT=/opt/mylibpro/libdata \
 *     npx tsx scripts/normalize-tags.ts --confirm
 */

import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { loadEnvConfig } from "@next/env";

const PROJECT_ROOT = path.resolve(__dirname, "..");
loadEnvConfig(PROJECT_ROOT);

const DEFAULT_DATA_ROOT = "D:\\bookdata\\libdata";
const DATA_ROOT = process.env.DATA_ROOT || (fs.existsSync(DEFAULT_DATA_ROOT) ? DEFAULT_DATA_ROOT : path.resolve(PROJECT_ROOT, "..", "data"));
const DB_PATH = process.env.DB_PATH ? path.resolve(PROJECT_ROOT, process.env.DB_PATH) : path.join(PROJECT_ROOT, "db", "library.db");
const CONFIRM = process.argv.includes("--confirm");

interface Rule { canon: { en: string; zh: string }; en: string[]; zh: string[] }

// Discipline-level rules (confirmed): merge "定量金融"→"量化金融"; the 2 docs
// using "Financial Mathematics/金融数学" as a *discipline* → Quantitative Finance.
const DISCIPLINE_RULES: Rule[] = [
    { canon: { en: "Quantitative Finance", zh: "量化金融" }, en: ["Quantitative Finance", "Financial Mathematics"], zh: ["定量金融", "量化金融", "金融数学"] },
];

// Subdiscipline-level rules (confirmed).
const SUBDISCIPLINE_RULES: Rule[] = [
    { canon: { en: "Probability Theory and Stochastic Processes", zh: "概率论与随机过程" }, en: ["Probability and Stochastic Processes", "Probability Theory and Stochastic Processes"], zh: ["概率论与随机过程"] },
    { canon: { en: "Numerical Analysis", zh: "数值分析" }, en: ["Numerical Analysis", "Numerical Computation"], zh: ["数值分析", "数值计算"] },
    { canon: { en: "Asymptotic Theory", zh: "渐近理论" }, en: ["Asymptotic Theory", "Large Sample Theory", "Large-Sample Theory"], zh: ["渐近理论", "大样本理论"] },
    { canon: { en: "Monte Carlo Methods", zh: "蒙特卡洛方法" }, en: ["Monte Carlo Methods"], zh: ["蒙特卡罗方法", "蒙特卡洛方法"] },
    { canon: { en: "Statistics of Stochastic Processes", zh: "随机过程统计" }, en: ["Statistics for Stochastic Processes", "Statistics of Stochastic Processes"], zh: ["随机过程统计"] },
    { canon: { en: "Financial Mathematics", zh: "金融数学" }, en: ["Mathematical Finance", "Financial Mathematics"], zh: ["金融数学"] },
    { canon: { en: "Derivatives Pricing", zh: "衍生品定价" }, en: ["Derivative Pricing", "Derivatives Pricing"], zh: ["衍生品定价"] },
    { canon: { en: "Matrix Computations", zh: "矩阵计算" }, en: ["Matrix Computation", "Matrix Computations"], zh: ["矩阵计算"] },
    { canon: { en: "Multivariable Calculus", zh: "多变量微积分" }, en: ["Multivariate Calculus", "Multivariable Calculus"], zh: ["多变量微积分"] },
    { canon: { en: "State-Space Models", zh: "状态空间模型" }, en: ["State Space Models", "State-Space Model", "State-Space Models"], zh: ["状态空间模型"] },
    { canon: { en: "Financial Stochastic Analysis", zh: "金融随机分析" }, en: ["Stochastic Analysis in Finance", "Financial Stochastic Analysis"], zh: ["金融随机分析"] },
    { canon: { en: "Statistical Computing", zh: "统计计算" }, en: ["Statistical Computation", "Statistical Computing"], zh: ["统计计算"] },
    { canon: { en: "Foundations of Machine Learning", zh: "机器学习基础" }, en: ["Fundamentals of Machine Learning", "Foundations of Machine Learning"], zh: ["机器学习基础"] },
    // Pure capitalization fixes (Title Case).
    { canon: { en: "Statistical Inference", zh: "统计推断" }, en: ["Statistical Inference", "Statistical inference"], zh: ["统计推断"] },
    { canon: { en: "High-Dimensional Statistics", zh: "高维统计" }, en: ["High-Dimensional Statistics", "High-dimensional statistics"], zh: ["高维统计"] },
];

function J(s: string): string[] { try { const v = JSON.parse(s || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }

function canonFor(rules: Rule[], en: string, zh: string): { en: string; zh: string } | null {
    for (const r of rules) {
        if (r.en.includes(en) || r.zh.includes(zh)) return r.canon;
    }
    return null;
}

/** Normalize one aligned (base, zh, en) triple-array. Dedupes within the array. */
function normalize(rules: Rule[], base: string[], zh: string[], en: string[]) {
    const outBase: string[] = [], outZh: string[] = [], outEn: string[] = [];
    const seen = new Set<string>();
    let changed = false;
    const replacements: string[] = [];
    for (let i = 0; i < base.length; i++) {
        const e = (en[i] || base[i] || "").trim();
        const z = (zh[i] || base[i] || "").trim();
        const canon = canonFor(rules, e, z);
        let nb: string, nz: string, ne: string;
        if (canon) {
            ne = canon.en; nz = canon.zh; nb = canon.en;
            if (ne !== e || nz !== z) { changed = true; replacements.push(`"${e} / ${z}" → "${ne} / ${nz}"`); }
        } else { nb = base[i]; nz = z; ne = e; }
        const key = `${ne}|||${nz}`;
        if (seen.has(key)) { changed = true; replacements.push(`(deduped "${ne} / ${nz}")`); continue; }
        seen.add(key);
        outBase.push(nb); outZh.push(nz); outEn.push(ne);
    }
    return { base: outBase, zh: outZh, en: outEn, changed, replacements };
}

function main() {
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    const rows = db.prepare(`SELECT document_id, type, folder_name,
        discipline, discipline_zh, discipline_en,
        subdiscipline, subdiscipline_zh, subdiscipline_en FROM documents`).all() as Record<string, string>[];

    const update = db.prepare(`UPDATE documents SET
        discipline=@discipline, discipline_zh=@discipline_zh, discipline_en=@discipline_en,
        subdiscipline=@subdiscipline, subdiscipline_zh=@subdiscipline_zh, subdiscipline_en=@subdiscipline_en
        WHERE document_id=@document_id`);

    let docChanges = 0;
    let metaWrites = 0;
    const replacementTally = new Map<string, number>();

    const apply = db.transaction((pending: { params: Record<string, string>; folder: string; type: string; d: ReturnType<typeof normalize>; s: ReturnType<typeof normalize> }[]) => {
        for (const p of pending) {
            update.run(p.params);
            // metadata.json mirror
            const metaPath = path.join(DATA_ROOT, p.type || "book", p.folder, "metadata.json");
            if (fs.existsSync(metaPath)) {
                try {
                    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
                    meta.discipline = p.d.base;
                    meta.discipline_i18n = { zh: p.d.zh, en: p.d.en };
                    meta.subdiscipline = p.s.base;
                    meta.subdiscipline_i18n = { zh: p.s.zh, en: p.s.en };
                    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
                    metaWrites++;
                } catch (e) {
                    console.warn(`  ! metadata.json write failed for ${p.params.document_id}: ${e instanceof Error ? e.message : e}`);
                }
            }
        }
    });

    const pending: { params: Record<string, string>; folder: string; type: string; d: ReturnType<typeof normalize>; s: ReturnType<typeof normalize> }[] = [];

    for (const r of rows) {
        const d = normalize(DISCIPLINE_RULES, J(r.discipline), J(r.discipline_zh), J(r.discipline_en));
        const s = normalize(SUBDISCIPLINE_RULES, J(r.subdiscipline), J(r.subdiscipline_zh), J(r.subdiscipline_en));
        if (!d.changed && !s.changed) continue;
        docChanges++;
        for (const rep of [...d.replacements, ...s.replacements]) replacementTally.set(rep, (replacementTally.get(rep) || 0) + 1);
        console.log(`• ${r.document_id}`);
        for (const rep of [...d.replacements, ...s.replacements]) console.log(`    ${rep}`);
        pending.push({
            params: {
                document_id: r.document_id,
                discipline: JSON.stringify(d.base), discipline_zh: JSON.stringify(d.zh), discipline_en: JSON.stringify(d.en),
                subdiscipline: JSON.stringify(s.base), subdiscipline_zh: JSON.stringify(s.zh), subdiscipline_en: JSON.stringify(s.en),
            },
            folder: r.folder_name, type: r.type, d, s,
        });
    }

    console.log(`\n─── Replacement summary ───`);
    for (const [rep, c] of [...replacementTally.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${c}×  ${rep}`);
    console.log(`\nDocuments affected: ${docChanges} / ${rows.length}`);
    console.log(`DB: ${DB_PATH}`);
    console.log(`DATA_ROOT: ${DATA_ROOT}`);

    if (!CONFIRM) {
        console.log(`\n*** DRY-RUN — nothing written. Re-run with --confirm to apply. ***`);
        db.close();
        return;
    }

    apply(pending);
    console.log(`\n✓ WROTE ${docChanges} documents in DB; updated ${metaWrites} metadata.json files.`);
    db.close();
}

main();
