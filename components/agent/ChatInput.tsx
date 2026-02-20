"use client";

import { useState, useRef, useEffect } from "react";

interface ChatInputProps {
    onSend: (text: string) => void;
    isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        const ta = textareaRef.current;
        if (ta) {
            ta.style.height = "auto";
            ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
        }
    }, [text]);

    const handleSubmit = () => {
        if (!text.trim() || isLoading) return;
        onSend(text.trim());
        setText("");
        // Reset height
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className="chat-input-area">
            <div className="chat-input-container">
                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入你的学术问题..."
                    disabled={isLoading}
                    rows={1}
                    className="chat-textarea"
                />
                <button
                    onClick={handleSubmit}
                    disabled={!text.trim() || isLoading}
                    className="chat-send-btn"
                    title="发送 (Enter)"
                >
                    {isLoading ? (
                        <div className="tool-spinner" />
                    ) : (
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="m5 12 7-7 7 7" />
                            <path d="M12 19V5" />
                        </svg>
                    )}
                </button>
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
                按 Enter 发送 · Shift + Enter 换行 · AI 助手基于图书馆文献回答
            </p>
        </div>
    );
}
