import { track } from "@/lib/agent-activity";
import type { ChatRequest, ChatResponse } from "@/types/chat";

export function requestChatReply(input: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  return track("thinking", "Answering your question", () => fetchChatReply(input, signal));
}

async function fetchChatReply(input: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    return (await response.json()) as ChatResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: "Could not reach the Fluid Research server." },
    };
  }
}
