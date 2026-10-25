import type { ChatResponse } from "@/types/chat";

/** MOCK DATA for building chat UI without a Gemini key. */
export const MOCK_CHAT_RESPONSE = {
  ok: true,
  data: {
    reply:
      "The paper trains with **Grover amplification** rather than sampling one trajectory at a time (p. 1).\n\n- Accepted and rejected paths interfere as an ensemble.\n- Success probability peaks below one, which sets the training target (p. 2).",
  },
} satisfies ChatResponse;
