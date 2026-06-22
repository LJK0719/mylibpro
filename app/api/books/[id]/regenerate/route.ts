import { NextRequest, NextResponse } from "next/server";
import type { ThinkingLevel } from "@google/genai";
import { createGeminiClient, resolveAgentConfig } from "@/lib/agent/providers";
import { getDataRoot } from "@/lib/config";
import type { DocumentRecord } from "@/lib/db";
import {
    getDocumentById,
    getDocumentViewById,
    updateDocumentFields,
    type DocumentPatchInput,
} from "@/lib/repositories/documents";
import fs from "fs";
import path from "path";

type RegenerateField = "abstract" | "toc";
const TOC_DETECTION_CHAR_LIMIT = 100_000;

interface RegenerateRequest {
    field?: RegenerateField;
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
}

function isRegenerateField(value: unknown): value is RegenerateField {
    return value === "abstract" || value === "toc";
}

function safeJoinDataPath(dataRoot: string, ...segments: string[]) {
    const resolvedRoot = path.resolve(dataRoot);
    const resolvedPath = path.resolve(dataRoot, ...segments);
    if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + path.sep)) {
        return "";
    }
    return resolvedPath;
}

function resolveMarkdownPath(row: DocumentRecord, dataRoot: string) {
    const fullTextPath = row.full_text_path || "";
    const normalizedFullTextPath = fullTextPath.replace(/^library[\\/]/, "");
    const docType = row.type || "book";
    const folderName = row.folder_name || row.document_id;

    const candidates = [
        normalizedFullTextPath ? safeJoinDataPath(dataRoot, normalizedFullTextPath) : "",
        fullTextPath ? safeJoinDataPath(dataRoot, fullTextPath) : "",
        safeJoinDataPath(dataRoot, docType, folderName, "parsed", "full_text.md"),
        safeJoinDataPath(dataRoot, docType, folderName, "full_text.md"),
        safeJoinDataPath(dataRoot, docType, folderName, "content.md"),
        safeJoinDataPath(dataRoot, "library", docType, folderName, "parsed", "full_text.md"),
        safeJoinDataPath(dataRoot, "library", docType, folderName, "full_text.md"),
        safeJoinDataPath(dataRoot, "library", docType, folderName, "content.md"),
    ].filter(Boolean);

    return {
        foundPath: candidates.find((candidate) => fs.existsSync(candidate)) || "",
        candidates,
    };
}

function readFullText(row: DocumentRecord, dataRoot: string) {
    const { foundPath: markdownPath, candidates } = resolveMarkdownPath(row, dataRoot);
    if (markdownPath) {
        return fs.readFileSync(markdownPath, "utf-8");
    }

    throw new Error(
        `Full text file not found for document: ${row.document_id}. Tried: ${candidates.join("; ")}`
    );
}

async function callTextModel(input: {
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    system: string;
    prompt: string;
}) {
    const config = resolveAgentConfig(input);
    if (!config.apiKey) {
        throw new Error("API Key is required. Configure the API key or set it in advanced settings.");
    }
    if (!config.model) {
        throw new Error("Model name is required. Configure the model env var or set it in advanced settings.");
    }

    // Gemini — native SDK
    if (config.provider === "gemini") {
        const ai = createGeminiClient(config.apiKey);
        const response = await ai.models.generateContent({
            model: config.model,
            contents: [{ role: "user", parts: [{ text: input.prompt }] }],
            config: {
                systemInstruction: input.system,
                thinkingConfig: { thinkingLevel: "high" as ThinkingLevel },
            },
        });
        const text = response.text;
        if (!text?.trim()) {
            throw new Error("Gemini API returned no text.");
        }
        return text.trim();
    }

    // Claude — native Anthropic Messages API
    if (config.provider === "claude") {
        const res = await fetch(`${config.baseUrl}/v1/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": config.apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: config.model,
                max_tokens: 4096,
                system: input.system,
                messages: [{ role: "user", content: input.prompt }],
            }),
        });
        if (!res.ok) {
            throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
        }
        const data = await res.json();
        const textBlocks = (data.content || [])
            .filter((b: { type: string }) => b.type === "text")
            .map((b: { text: string }) => b.text)
            .join("");
        if (!textBlocks.trim()) {
            throw new Error("Claude API returned no text.");
        }
        return textBlocks.trim();
    }

    // OpenAI / DeepSeek — OpenAI-compatible /v1/chat/completions
    const baseUrl = config.baseUrl;
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
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API error ${res.status}: ${text}`);
    }

    const respData = await res.json();
    const msgText = respData.choices?.[0]?.message?.content;
    if (typeof msgText !== "string" || !msgText.trim()) {
        throw new Error("API returned no text.");
    }
    return msgText.trim();
}

function parseTocDetection(raw: string): { has_toc: boolean; toc: string } | null {
    const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    try {
        const parsed = JSON.parse(trimmed) as { has_toc?: unknown; toc?: unknown };
        return {
            has_toc: parsed.has_toc === true,
            toc: typeof parsed.toc === "string" ? parsed.toc.trim() : "",
        };
    } catch {
        return null;
    }
}

async function regenerateAbstract(row: DocumentRecord, fullText: string, request: RegenerateRequest) {
    return callTextModel({
        ...request,
        system: "你是严谨的学术文献整理助手。只根据用户提供的全文生成内容，不编造全文之外的信息。",
        prompt: [
            `请为下面这篇文献生成中文摘要。`,
            `要求：`,
            `1. 只基于全文内容。`,
            `2. 覆盖研究主题、核心问题、方法/章节结构、主要贡献或结论。`,
            `3. 用 2 到 5 个自然段，适合展示在个人学术文献库详情页。`,
            `4. 不要输出标题、Markdown 代码块或项目符号。`,
            ``,
            `文献标题：${row.title}`,
            `全文：`,
            fullText,
        ].join("\n"),
    });
}

async function regenerateToc(row: DocumentRecord, fullText: string, request: RegenerateRequest) {
    const detection = await callTextModel({
        ...request,
        system: "你是目录提取器。你必须严格输出 JSON，不要输出解释。",
        prompt: [
            `下面是文献全文的前 ${TOC_DETECTION_CHAR_LIMIT.toLocaleString("en-US")} 个字符。请判断其中是否已经包含目录。`,
            `如果包含目录，提取目录原文并清理页码、乱码和重复空行。`,
            `如果不包含目录，toc 返回空字符串。`,
            `严格输出 JSON：{"has_toc":true|false,"toc":"..."}`,
            ``,
            `文献标题：${row.title}`,
            `文本：`,
            fullText.slice(0, TOC_DETECTION_CHAR_LIMIT),
        ].join("\n"),
    });

    const parsed = parseTocDetection(detection);
    if (parsed?.has_toc && parsed.toc) {
        return parsed.toc;
    }

    return callTextModel({
        ...request,
        system: "你是严谨的学术文献目录生成助手。只根据用户提供的全文生成结构化目录。",
        prompt: [
            `请根据下面的全文为文献生成中文目录。`,
            `要求：`,
            `1. 如果全文中有明确章节标题，优先保留原章节层级和标题。`,
            `2. 如果没有明确目录，请根据全文结构生成合理目录。`,
            `3. 每行一个目录项，用缩进表示层级。`,
            `4. 不要输出说明文字、Markdown 代码块或额外评论。`,
            ``,
            `文献标题：${row.title}`,
            `全文：`,
            fullText,
        ].join("\n"),
    });
}

function writeMetadata(row: DocumentRecord, updates: DocumentPatchInput) {
    const dataRoot = getDataRoot();
    const metaPath = safeJoinDataPath(dataRoot, row.type || "book", row.folder_name, "metadata.json");
    const fallbackMetaPath = safeJoinDataPath(dataRoot, "library", row.type || "book", row.folder_name, "metadata.json");
    const existingPath = [metaPath, fallbackMetaPath].filter(Boolean).find((candidate) => fs.existsSync(candidate));
    if (!existingPath) return;

    const meta = JSON.parse(fs.readFileSync(existingPath, "utf-8"));
    if (updates.abstract !== undefined) meta.abstract = updates.abstract;
    if (updates.toc !== undefined) meta.toc = updates.toc;
    fs.writeFileSync(existingPath, JSON.stringify(meta, null, 2), "utf-8");
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const row = getDocumentById(id);
    if (!row) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    let body: RegenerateRequest;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!isRegenerateField(body.field)) {
        return NextResponse.json({ error: "field must be 'abstract' or 'toc'" }, { status: 400 });
    }

    try {
        const fullText = readFullText(row, getDataRoot());
        const generated = body.field === "abstract"
            ? await regenerateAbstract(row, fullText, body)
            : await regenerateToc(row, fullText, body);

        const updates: DocumentPatchInput = body.field === "abstract"
            ? { abstract: generated }
            : { toc: generated };

        updateDocumentFields(id, updates);
        writeMetadata(row, updates);

        return NextResponse.json({
            field: body.field,
            value: generated,
            document: getDocumentViewById(id),
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to regenerate field.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
