import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(SCRIPT_DIR);
const ENV_PATH = path.join(PROJECT_ROOT, ".env.local");
const THUMB_WIDTH = 600;

if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, "utf-8").split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const separator = trimmed.indexOf("=");
        if (separator === -1) continue;

        const key = trimmed.slice(0, separator).trim();
        const value = trimmed.slice(separator + 1).trim();
        process.env[key] = value;
    }
}

const dataRoot = process.env.DATA_ROOT || path.join(path.dirname(PROJECT_ROOT), "data");
const outputDir = path.join(PROJECT_ROOT, "public", "covers");
const sourceDirs = [path.join(dataRoot, "book"), path.join(dataRoot, "paper")];

async function generateCover(pdfPath: string, outputPath: string): Promise<boolean> {
    try {
        const buffer = fs.readFileSync(pdfPath);
        const document = await getDocument({
            data: new Uint8Array(buffer),
        }).promise;

        if (document.numPages === 0) return false;

        const page = await document.getPage(1);
        const initialViewport = page.getViewport({ scale: 1 });
        const scale = THUMB_WIDTH / initialViewport.width;
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d");

        const renderParams = {
            canvas,
            canvasContext: context,
            viewport,
        } as never;

        await page.render(renderParams).promise;

        fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
        await document.destroy();
        return true;
    } catch (error) {
        console.log(`   ✗ Error: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

async function main() {
    fs.mkdirSync(outputDir, { recursive: true });

    let totalGenerated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const sourceDir of sourceDirs) {
        if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
            console.log(`⚠ Directory not found: ${sourceDir}, skipping.`);
            continue;
        }

        const dirName = path.basename(sourceDir);
        const folders = fs
            .readdirSync(sourceDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();

        console.log(`\n📚 Scanning ${dirName}: ${folders.length} folders`);

        for (const folder of folders) {
            const pdfPath = path.join(sourceDir, folder, "original.pdf");
            const outputPath = path.join(outputDir, `${folder}.png`);

            if (fs.existsSync(outputPath)) {
                const pdfMtime = fs.existsSync(pdfPath) ? fs.statSync(pdfPath).mtimeMs : 0;
                const coverMtime = fs.statSync(outputPath).mtimeMs;
                if (coverMtime >= pdfMtime) {
                    totalSkipped++;
                    continue;
                }
            }

            if (!fs.existsSync(pdfPath)) {
                console.log(`   ⚠ No PDF: ${folder}`);
                totalErrors++;
                continue;
            }

            if (await generateCover(pdfPath, outputPath)) {
                totalGenerated++;
                if (totalGenerated % 10 === 0) {
                    console.log(`   ✓ Generated ${totalGenerated} covers...`);
                }
            } else {
                totalErrors++;
                console.log(`   ✗ Failed: ${folder}`);
            }
        }
    }

    console.log("\n✅ Done!");
    console.log(`   Generated: ${totalGenerated}`);
    console.log(`   Skipped (up-to-date): ${totalSkipped}`);
    console.log(`   Errors: ${totalErrors}`);
    console.log(`   Output: ${outputDir}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
