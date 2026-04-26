/**
 * POST /api/agent/chat
 *
 * Streaming chat endpoint implementing the RAG agent workflow.
 *
 * ─── Workflow State Machine ──────────────────────────────────────
 *
 * The agent loop enforces the design doc workflow through code,
 * NOT through prompt instructions. The available Function Declarations
 * are dynamically selected based on the current workflow phase
 * (see lib/agent/state-machine.ts for the authoritative transitions):
 *
 *   INITIAL      ──search(non-empty)─────────────→ MUST_READ
 *   INITIAL      ──search(empty)─────────────────→ INITIAL (can retry)
 *   MUST_READ    ──load_chapter / load_full_text→ MUST_RECORD
 *   MUST_READ    ──load_full_text(book)──────────→ MUST_READ (must call load_chapter)
 *   MUST_READ    ──decide(answer)────────────────→ CAN_DECIDE (browse-query escape)
 *   MUST_RECORD  ──record_reading────────────────→ MUST_NOTES
 *   MUST_NOTES   ──update_research_notes─────────→ MUST_DECIDE
 *   MUST_DECIDE  ──decide(answer)────────────────→ CAN_DECIDE
 *   MUST_DECIDE  ──decide(read_more)─────────────→ MUST_READ
 *   MUST_DECIDE  ──decide(search_more)───────────→ INITIAL
 *   CAN_DECIDE   ──(text output)─────────────────→ done
 *
 * Available tools per phase:
 *   INITIAL:      all tools
 *   MUST_READ:    get_document_detail, load_full_text, load_chapter,
 *                 remove_reference, decide_continue_or_answer
 *   MUST_RECORD:  record_reading
 *   MUST_NOTES:   update_research_notes
 *   MUST_DECIDE:  decide_continue_or_answer
 *   CAN_DECIDE:   all tools
 */

import { NextRequest } from "next/server";
import {
    type ChatMessage,
    type OpenAIMessage,
    resolveAgentConfig,
    createGeminiClient,
    callGemini,
    callOpenAICompatible,
} from "@/lib/agent/providers";
import {
    type WorkflowPhase,
    getPhaseTools,
    phaseAfterTool,
    getPhaseHint,
} from "@/lib/agent/state-machine";
import {
    executeTool,
} from "@/lib/agent/tools";
import {
    getOrCreateSession,
    getWorkspaceSummary,
    getWorkspaceSnapshot,
    addArtifact,
    recordEvent,
    updateSession,
} from "@/lib/agent/workspace";
import { getResearchSkillPrompt } from "@/lib/agent/skills";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";



// ─── Types ───────────────────────────────────────────────────────

function persistFinalAnswer(sessionId: string, answer: string) {
    if (!answer.trim()) return;
    const snapshot = getWorkspaceSnapshot(sessionId);
    const sourceDocumentIds = Array.from(
        new Set([
            ...snapshot.activeReferences.map((ref) => ref.documentId),
            ...snapshot.readingHistory
                .filter((entry) => entry.citationUsed || entry.keyFindings)
                .map((entry) => entry.documentId),
        ])
    );

    const artifact = addArtifact(sessionId, {
        type: "final_answer",
        title: "Final answer",
        contentMarkdown: answer,
        sourceDocumentIds,
    });

    recordEvent(sessionId, {
        type: "answer_generated",
        payload: {
            artifactId: artifact.artifactId,
            sourceDocumentIds,
            answerLength: answer.length,
        },
    });
    updateSession(sessionId, { status: "completed" });
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const {
        message,
        sessionId = `session-${Date.now()}`,
        history = [],
        provider,
        apiKey,
        model,
        baseUrl,
    } = body as {
        message: string;
        sessionId?: string;
        history?: ChatMessage[];
        provider?: string;
        apiKey?: string;
        model?: string;
        baseUrl?: string;
    };

    if (!message) {
        return new Response(
            JSON.stringify({ error: "message is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }
    const agentConfig = resolveAgentConfig({ provider, apiKey, model, baseUrl });

    if (!agentConfig.apiKey) {
        return new Response(
            JSON.stringify({ error: `API Key is required. Configure ${agentConfig.provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"} or set it in advanced settings.` }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }
    if (!agentConfig.model) {
        return new Response(
            JSON.stringify({ error: "Model name is required. Configure the model env var or set it in advanced settings." }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    const ai = agentConfig.provider === "gemini"
        ? createGeminiClient(agentConfig.apiKey)
        : null;

    getOrCreateSession(sessionId, message);
    updateSession(sessionId, { userQuery: message, status: "active" });
    const workspaceContext = getWorkspaceSummary(sessionId);
    const skillContext = getResearchSkillPrompt();
    const userLanguageInstruction = /[㐀-鿿]/.test(message)
        ? "The user's question is Chinese. Use English for all internal planning, tool calls, search queries, reading notes, and research notebook updates. Produce only the final user-facing answer in Chinese."
        : "The user's question is not Chinese. Use English for internal planning, tool calls, search queries, reading notes, research notebook updates, and the final user-facing answer.";

    // Workspace context goes into system instruction, NOT the user message.
    // This prevents the model from confusing old research notes with the new question.
    const dynamicSystemPrompt = [
        SYSTEM_PROMPT,
        userLanguageInstruction,
        skillContext,
        "---",
        workspaceContext,
    ]
        .filter(Boolean)
        .join("\n\n");

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

    const openAIContents: OpenAIMessage[] = [
        ...history.map((msg) => ({
            role: msg.role === "model" ? "assistant" as const : "user" as const,
            content: msg.text,
        })),
        { role: "user", content: message },
    ];

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

                    if (agentConfig.provider === "openai") {
                        let response;
                        for (let retry = 0; retry < 3; retry++) {
                            try {
                                response = await callOpenAICompatible({
                                    config: agentConfig,
                                    system: dynamicSystemPrompt + phaseHint,
                                    messages: openAIContents,
                                    tools: phaseTools,
                                    sessionId,
                                });
                                break;
                            } catch (retryErr: unknown) {
                                const msg = retryErr instanceof Error ? retryErr.message : "";
                                const isRetryable =
                                    msg.includes("429") ||
                                    msg.includes("quota") ||
                                    msg.includes("rate") ||
                                    msg.includes("timeout") ||
                                    msg.includes("503");

                                if (isRetryable && retry < 2) {
                                    const waitMs = 5000 * (retry + 1);
                                    send({
                                        type: "status",
                                        message: `OpenAI-compatible API rate limited. Retrying in ${Math.ceil(waitMs / 1000)}s (${retry + 1}/3)...`,
                                    });
                                    await new Promise((r) => setTimeout(r, waitMs));
                                    continue;
                                }
                                throw retryErr;
                            }
                        }

                        if (!response) {
                            send({ type: "error", error: "OpenAI-compatible API call failed after retries." });
                            break;
                        }

                        if (response.toolCalls.length > 0) {
                            openAIContents.push(response.assistantMessage);

                            for (const toolCall of response.toolCalls) {
                                send({
                                    type: "tool_call",
                                    tool: toolCall.name,
                                    args: toolCall.args,
                                });

                                const toolResult = executeTool(
                                    toolCall.name,
                                    toolCall.args,
                                    sessionId
                                );

                                const hasError = "error" in (toolResult.result || {});

                                send({
                                    type: "tool_result",
                                    tool: toolCall.name,
                                    success: !hasError,
                                });

                                if (!hasError) {
                                    phase = phaseAfterTool(
                                        phase,
                                        toolCall.name,
                                        toolResult.result
                                    );
                                }

                                if (["record_reading", "update_research_notes", "remove_reference", "load_full_text", "load_chapter", "decide_continue_or_answer"].includes(toolCall.name)) {
                                    send({
                                        type: "workspace",
                                        workspace: getWorkspaceSnapshot(sessionId),
                                    });
                                }

                                openAIContents.push({
                                    role: "tool",
                                    tool_call_id: toolCall.id,
                                    content: JSON.stringify(toolResult.result),
                                });
                            }

                            continue;
                        }

                        if (phase === "must_read" || phase === "must_record" || phase === "must_notes" || phase === "must_decide") {
                            const nudge =
                                phase === "must_read"
                                    ? "You need to load one minimum full-text unit before answering. For books, call get_document_detail and load_chapter; for papers, call load_full_text. Keep all tool arguments and internal notes in English."
                                    : phase === "must_record"
                                        ? "You have loaded the full text. Call record_reading to save the reading findings in English before continuing."
                                        : phase === "must_notes"
                                            ? "Call update_research_notes to update the research notebook in English before continuing."
                                            : "Call decide_continue_or_answer before producing the final answer. Keep the decision rationale in English.";

                            openAIContents.push(response.assistantMessage);
                            openAIContents.push({ role: "user", content: nudge });
                            continue;
                        }

                        if (response.text) {
                            persistFinalAnswer(sessionId, response.text);
                            const chunkSize = 60;
                            for (let i = 0; i < response.text.length; i += chunkSize) {
                                const chunk = response.text.slice(i, i + chunkSize);
                                send({ type: "text", content: chunk });
                                await new Promise((r) => setTimeout(r, 15));
                            }
                        }

                        send({
                            type: "workspace",
                            workspace: getWorkspaceSnapshot(sessionId),
                        });

                        send({ type: "done" });
                        break;
                    }

                    // Call Gemini with retry (handles UNAVAILABLE + RESOURCE_EXHAUSTED)
                    let response;
                    for (let retry = 0; retry < 3; retry++) {
                        try {
                            response = await callGemini({
                                ai: ai!,
                                model: agentConfig.model,
                                contents: loopContents,
                                systemInstruction: dynamicSystemPrompt + phaseHint,
                                tools: phaseTools,
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
                                let waitMs = 5000 * (retry + 1);
                                const delayMatch = msg.match(/(?:retryDelay|retry in)\D*([\d.]+)\s*s/i);
                                if (delayMatch) {
                                    waitMs = Math.min(60000, Math.ceil(parseFloat(delayMatch[1]) * 1000));
                                }
                                send({
                                    type: "status",
                                    message: `API rate limited. Retrying in ${Math.ceil(waitMs / 1000)}s (${retry + 1}/3)...`,
                                });
                                await new Promise((r) => setTimeout(r, waitMs));
                                continue;
                            }
                            throw retryErr;
                        }
                    }

                    if (!response) {
                        send({ type: "error", error: "API call failed after 3 retries." });
                        break;
                    }

                    const candidate = response.candidates?.[0];
                    if (!candidate?.content?.parts) {
                        send({ type: "error", error: "Model returned no content." });
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
                                phase = phaseAfterTool(
                                    phase,
                                    fc.name!,
                                    toolResult.result
                                );
                            }

                            // Push workspace update after workspace-affecting tools
                            if (["record_reading", "update_research_notes", "remove_reference", "load_full_text", "load_chapter", "decide_continue_or_answer"].includes(fc.name!)) {
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
                    if (phase === "must_read" || phase === "must_record" || phase === "must_notes" || phase === "must_decide") {
                        // Model tried to answer without completing the workflow.
                        // Add a nudge and loop once more.
                        const nudge =
                            phase === "must_read"
                                ? "You need to load one minimum full-text unit before answering. For books/textbooks, call get_document_detail and then load_chapter; for papers, call load_full_text. Keep all tool arguments and internal notes in English."
                                : phase === "must_record"
                                    ? "You have loaded the full text. Call record_reading to save English reading findings."
                                    : phase === "must_notes"
                                        ? "Call update_research_notes to update the research notebook in English before continuing."
                                        : "Call decide_continue_or_answer before producing the final answer. Keep the decision rationale in English.";

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
                        persistFinalAnswer(sessionId, text);
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
                            "\n\nAgent reached the maximum tool-call limit and generated an answer from the available evidence.",
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
