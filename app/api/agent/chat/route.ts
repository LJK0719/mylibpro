/**
 * POST /api/agent/chat
 *
 * Streaming chat endpoint implementing the RAG agent workflow.
 *
 * ─── Workflow State Machine ──────────────────────────────────────
 *
 * The agent loop enforces the design doc workflow through code,
 * NOT through prompt instructions. The available Function Declarations
 * are dynamically selected based on the current workflow phase:
 *
 *   INITIAL ──search(non-empty)──→ MUST_READ
 *   INITIAL ──search(empty)──────→ INITIAL (can retry)
 *   MUST_READ ──load_full_text───→ MUST_RECORD
 *   MUST_RECORD ──record_reading─→ MUST_NOTES
 *   MUST_NOTES ──update_notes────→ CAN_DECIDE
 *   CAN_DECIDE ──search(non-empty)→ MUST_READ
 *   CAN_DECIDE ──load_full_text──→ MUST_RECORD
 *   CAN_DECIDE ──(text output)───→ done
 *
 * Available tools per phase:
 *   INITIAL:      all tools
 *   MUST_READ:    get_document_detail, load_full_text, remove_reference
 *   MUST_RECORD:  record_reading
 *   MUST_NOTES:   update_research_notes
 *   CAN_DECIDE:   all tools
 */

import { NextRequest } from "next/server";
import { GoogleGenAI, type FunctionDeclaration } from "@google/genai";
import {
    searchLibraryDeclaration,
    loadFullTextDeclaration,
    getDocumentDetailDeclaration,
    recordReadingDeclaration,
    updateResearchNotesDeclaration,
    removeReferenceDeclaration,
    allDeclarations,
    executeTool,
} from "@/lib/agent-tools";
import {
    getOrCreateSession,
    getWorkspaceSummary,
    getWorkspaceSnapshot,
} from "@/lib/workspace";



// ─── Workflow phases ─────────────────────────────────────────────

type WorkflowPhase =
    | "initial"     // Can do anything: search, read, or answer directly
    | "must_read"   // Search returned results → must load & read at least one
    | "must_record" // Loaded full text → must call record_reading
    | "must_notes"  // Recorded reading → must call update_research_notes
    | "can_decide"; // Completed one full read cycle → can search again, read more, or answer

/**
 * Returns the set of function declarations available in the given phase.
 */
function getPhaseTools(phase: WorkflowPhase): FunctionDeclaration[] {
    switch (phase) {
        case "initial":
        case "can_decide":
            // Full freedom: all tools available
            return allDeclarations as unknown as FunctionDeclaration[];

        case "must_read":
            // Must read a document. Can also check details or remove refs.
            return [
                getDocumentDetailDeclaration,
                loadFullTextDeclaration,
                removeReferenceDeclaration,
            ] as unknown as FunctionDeclaration[];

        case "must_record":
            // Must record the reading before anything else
            return [recordReadingDeclaration] as unknown as FunctionDeclaration[];

        case "must_notes":
            // Must update research notes before anything else
            return [updateResearchNotesDeclaration] as unknown as FunctionDeclaration[];
    }
}

/**
 * Returns a phase-specific system instruction addition.
 * This provides context on what the model should do next.
 */
function getPhaseHint(phase: WorkflowPhase): string {
    switch (phase) {
        case "must_read":
            return "\n\n[系统提示] 搜索已返回结果，请确定阅读顺序并加载全文进行深度阅读。";
        case "must_record":
            return "\n\n[系统提示] 你已加载并阅读了全文，请调用 record_reading 记录你的关键发现。";
        case "must_notes":
            return "\n\n[系统提示] 阅读记录已完成，请调用 update_research_notes 更新研究笔记。";
        default:
            return "";
    }
}

// ─── System Prompt ───────────────────────────────────────────────

const SYSTEM_PROMPT = `你是 LibPro 学术研究助手——一位严谨的学术 RAG 领域专家。你可以访问一个包含大量图书与论文的数字图书馆，并拥有完整的工作区管理能力。

## 你的工具

### 读取工具（信息获取）
1. **search_library** — 搜索图书馆目录，返回文献元数据列表
2. **get_document_detail** — 获取文献详细元数据（摘要、目录、关键词等），用于确定阅读顺序
3. **load_full_text** — 加载文献的完整 Markdown 全文（自动加入参考文献表）

### 写入工具（工作区管理）
4. **record_reading** — 阅读完成后记录关键发现并创建阅读历史条目（文献保留在参考文献表中）
5. **update_research_notes** — 更新研究笔记（结构化 Markdown 格式）
6. **remove_reference** — 主动移除低相关度文献以释放上下文空间（这是唯一从参考文献表移除文献的方式）

## 研究笔记 (Research Notes)

你的工作区中包含一份 **研究笔记 (Research Notebook)**，用于记录你在阅读文献过程中的关键发现、数据支撑和待解决的问题。

**要求：**
- **拒绝平铺直叙的摘要**：不要只是简单罗列文献内容。
- **强调批判性思考**：请记录你对文献的分析、评价和质疑。
- **关注点**：
    - 矛盾点：该文献与已知信息是否冲突？
    - 创新点：相比其他研究，它的独特贡献是什么？
    - 局限性：方法论有什么缺陷？数据是否过时？
    - 关联性：如何连接到用户的问题？
- 笔记内容由你自主决定，只需记录对回答用户问题有价值的信息
- 保持笔记简洁、结构清晰
- 每次阅读完文献后，必须调用 \`update_research_notes\` 更新笔记
- 你可以选择 \`append\` (追加) 新发现，或者 \`replace\` (重写) 整理后的笔记

## 回答规范
- 使用中文回答，专业、深入、有理有据
- 必须标注引用来源，格式为 [文献标题, 作者, 年份]
- 使用 Markdown 格式组织回答
- 最终答案末尾生成标准格式引用列表
- 除非用户明确要求，否则优先加载教材（book）作为理论基础，再加载论文（paper）获取前沿进展
- 如果问题模糊或需要澄清，向用户提出明确的问题
- 如果问题超出图书馆文献范围，诚实告知用户`;

// ─── Types ───────────────────────────────────────────────────────

interface ChatMessage {
    role: "user" | "model";
    text: string;
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const {
        message,
        sessionId = `session-${Date.now()}`,
        history = [],
        apiKey,
        model,
    } = body as {
        message: string;
        sessionId?: string;
        history?: ChatMessage[];
        apiKey?: string;
        model?: string;
    };

    if (!message) {
        return new Response(
            JSON.stringify({ error: "message is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }
    if (!apiKey) {
        return new Response(
            JSON.stringify({ error: "API Key is required. Please set it in the UI." }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }
    if (!model) {
        return new Response(
            JSON.stringify({ error: "Model name is required. Please set it in the UI." }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    const ai = new GoogleGenAI({ apiKey });
    const GEMINI_MODEL = model;

    getOrCreateSession(sessionId);
    const workspaceContext = getWorkspaceSummary(sessionId);

    // Workspace context goes into system instruction, NOT the user message.
    // This prevents the model from confusing old research notes with the new question.
    const dynamicSystemPrompt = workspaceContext
        ? `${SYSTEM_PROMPT}\n\n---\n\n${workspaceContext}`
        : SYSTEM_PROMPT;

    // Build contents array from history
    const contents: Array<{
        role: string;
        parts: Array<{ text: string }>;
    }> = [];

    for (const msg of history) {
        contents.push({
            role: msg.role === "model" ? "model" : "user",
            parts: [{ text: msg.text }],
        });
    }

    // User message stays clean — no workspace context mixed in
    contents.push({
        role: "user",
        parts: [{ text: message }],
    });

    // Create streaming response
    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();

            function send(data: Record<string, unknown>) {
                controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
            }

            try {
                send({ type: "session", sessionId });

                // ─── Agent loop with workflow state machine ─────────
                const loopContents = [...contents];
                let maxIterations = 20;
                let phase: WorkflowPhase = "initial";

                while (maxIterations-- > 0) {
                    // Select tools based on current workflow phase
                    const phaseTools = getPhaseTools(phase);
                    const phaseHint = getPhaseHint(phase);

                    // Call Gemini with retry (handles UNAVAILABLE + RESOURCE_EXHAUSTED)
                    let response;
                    for (let retry = 0; retry < 3; retry++) {
                        try {
                            response = await ai.models.generateContent({
                                model: GEMINI_MODEL,
                                contents: loopContents,
                                config: {
                                    systemInstruction: dynamicSystemPrompt + phaseHint,
                                    tools: [{ functionDeclarations: phaseTools }],
                                    thinkingConfig: {
                                        thinkingLevel: "high" as import("@google/genai").ThinkingLevel,
                                    },
                                },
                            });
                            break;
                        } catch (retryErr: unknown) {
                            const msg = retryErr instanceof Error ? retryErr.message : "";
                            const isRetryable =
                                msg.includes("UNAVAILABLE") ||
                                msg.includes("RESOURCE_EXHAUSTED") ||
                                msg.includes("429") ||
                                msg.includes("quota");

                            if (isRetryable && retry < 2) {
                                // Extract retryDelay from error (e.g. "retryDelay":"24s" or "Please retry in 24.69s")
                                let waitMs = 5000 * (retry + 1); // default backoff
                                const delayMatch = msg.match(/(?:retryDelay|retry in)\D*([\d.]+)\s*s/i);
                                if (delayMatch) {
                                    waitMs = Math.min(60000, Math.ceil(parseFloat(delayMatch[1]) * 1000));
                                }
                                send({
                                    type: "status",
                                    message: `⏳ API 限速，等待 ${Math.ceil(waitMs / 1000)} 秒后重试 (${retry + 1}/3)...`,
                                });
                                await new Promise((r) => setTimeout(r, waitMs));
                                continue;
                            }
                            throw retryErr;
                        }
                    }

                    if (!response) {
                        send({ type: "error", error: "API 调用失败（重试3次后）" });
                        break;
                    }

                    const candidate = response.candidates?.[0];
                    if (!candidate?.content?.parts) {
                        send({ type: "error", error: "模型未返回内容" });
                        break;
                    }

                    const functionCalls = response.functionCalls;

                    if (functionCalls && functionCalls.length > 0) {
                        // Execute all function calls and collect results
                        const functionResponseParts: Array<{
                            functionResponse: { name: string; response: { result: Record<string, unknown> } };
                        }> = [];

                        for (const fc of functionCalls) {
                            // Notify client about tool call
                            send({
                                type: "tool_call",
                                tool: fc.name,
                                args: fc.args,
                            });

                            // Execute the tool
                            const toolResult = executeTool(
                                fc.name!,
                                fc.args as Record<string, unknown>,
                                sessionId
                            );

                            const hasError = "error" in (toolResult.result || {});

                            // Send tool result event
                            send({
                                type: "tool_result",
                                tool: fc.name,
                                success: !hasError,
                            });

                            // ─── Workflow phase transitions ───────────
                            if (!hasError) {
                                switch (fc.name) {
                                    case "search_library": {
                                        const total = (toolResult.result as Record<string, unknown>).total as number;
                                        if (total > 0) {
                                            phase = "must_read";
                                        }
                                        break;
                                    }
                                    case "load_full_text":
                                        phase = "must_record";
                                        break;
                                    case "record_reading":
                                        phase = "must_notes";
                                        break;
                                    case "update_research_notes":
                                        phase = "can_decide";
                                        break;
                                }
                            }

                            // Push workspace update after workspace-affecting tools
                            if (["record_reading", "update_research_notes", "remove_reference", "load_full_text"].includes(fc.name!)) {
                                send({
                                    type: "workspace",
                                    workspace: getWorkspaceSnapshot(sessionId),
                                });
                            }

                            // Collect function response
                            functionResponseParts.push({
                                functionResponse: {
                                    name: fc.name!,
                                    response: { result: toolResult.result },
                                },
                            });
                        }

                        // ─── Correct Gemini API protocol ─────────────────
                        // 1. Push model's response (candidate.content) ONCE
                        loopContents.push(
                            candidate.content as { role: string; parts: Array<{ text: string }> }
                        );
                        // 2. Push ALL function responses in a SINGLE user turn
                        loopContents.push({
                            role: "user",
                            parts: functionResponseParts,
                        } as unknown as { role: string; parts: Array<{ text: string }> });

                        continue;
                    }

                    // ─── No function calls → model returned text ──────
                    // If we're in a forced phase, re-prompt instead of outputting
                    if (phase === "must_read" || phase === "must_record" || phase === "must_notes") {
                        // Model tried to answer without completing the workflow.
                        // Add a nudge and loop once more.
                        const nudge =
                            phase === "must_read"
                                ? "你需要先使用 load_full_text 加载并阅读至少一篇文献后才能回答。请选择一篇相关文献加载全文。"
                                : phase === "must_record"
                                    ? "你已加载全文，请使用 record_reading 记录你的阅读发现。"
                                    : "请使用 update_research_notes 更新你的研究笔记后再继续。";

                        loopContents.push(
                            candidate.content as { role: string; parts: Array<{ text: string }> }
                        );
                        loopContents.push({
                            role: "user",
                            parts: [{ text: nudge }],
                        });
                        continue;
                    }

                    // Phase is initial or can_decide → safe to output text
                    let text = "";
                    try {
                        text = response.text || "";
                    } catch {
                        // response.text getter can throw if response has no text parts
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const parts = candidate.content.parts as any[];
                        text = parts
                            ?.filter((p) => typeof p.text === "string")
                            .map((p) => p.text)
                            .join("") || "";
                    }
                    if (text) {
                        const chunkSize = 60;
                        for (let i = 0; i < text.length; i += chunkSize) {
                            const chunk = text.slice(i, i + chunkSize);
                            send({ type: "text", content: chunk });
                            await new Promise((r) => setTimeout(r, 15));
                        }
                    }

                    // Send final workspace state
                    send({
                        type: "workspace",
                        workspace: getWorkspaceSnapshot(sessionId),
                    });

                    send({ type: "done" });
                    break;
                }

                if (maxIterations <= 0) {
                    send({
                        type: "text",
                        content:
                            "\n\n⚠️ Agent 达到了最大工具调用次数限制，已基于已有信息生成回答。",
                    });
                    send({
                        type: "workspace",
                        workspace: getWorkspaceSnapshot(sessionId),
                    });
                    send({ type: "done" });
                }
            } catch (err: unknown) {
                const errorMessage =
                    err instanceof Error ? err.message : "Unknown error";
                send({
                    type: "error",
                    error: errorMessage,
                });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}
