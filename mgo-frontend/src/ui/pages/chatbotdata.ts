import { call } from "../../api/client";
import { endpoints } from "../../api/endpoints";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ChatRole = "user" | "bot";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
};

/** Everything a customer can change to make the widget their own. */
export type ChatbotConfig = {
  title: string;
  subtitle: string;
  /** Which side the assistant sits on — visitors always take the other side. */
  botSide: "left" | "right";
  /** Emoji or an image URL. */
  botAvatar: string;
  userAvatar: string;
  botColor: string;
  userColor: string;
  backgroundColor: string;
  headerColor: string;
  accentColor: string;
  welcomeMessage: string;
  placeholder: string;
};

/* -------------------------------------------------------------------------- */
/* Customisation — edit these values per customer                             */
/* -------------------------------------------------------------------------- */

export const chatbotConfig: ChatbotConfig = {
  title: "Margo assistant",
  subtitle: "Usually replies instantly",
  botSide: "left",
  botAvatar: "🤖",
  userAvatar: "🧑",
  botColor: "#f0faf8",
  userColor: "#0a756c",
  backgroundColor: "#ffffff",
  headerColor: "#ffffff",
  accentColor: "#0a756c",
  welcomeMessage:
    "Hi! I'm the Margo assistant. Ask me anything about acme.com.",
  placeholder: "Ask about pricing, docs or setup…",
};

/** The conversation the widget opens with. */
export const initialMessages: ChatMessage[] = [
  { id: "welcome", role: "bot", text: chatbotConfig.welcomeMessage },
];

/* -------------------------------------------------------------------------- */
/* Replies                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `true`  → answer from the canned lines below, so the widget runs with no backend.
 * `false` → POST to `/api/v1/chat/messages` (see `endpoints.chat.sendMessage`).
 */
export const USE_FAKE_REPLIES = true;

/** Keyword → reply. Add as many as you need. */
const FAKE_REPLIES: Array<[match: RegExp, reply: string]> = [
  [
    /pric|cost|plan|bill/i,
    "Plans start at $29/month, and annual billing saves 20%.",
  ],
  [
    /embed|install|integrat|script|code/i,
    "Add one script tag before </body> — no backend changes needed.",
  ],
  [
    /pdf|document|upload|train|content/i,
    "Sync your site or upload PDFs and Margo indexes them automatically.",
  ],
  [
    /handoff|human|agent|support/i,
    "Any conversation can be routed to a human from the dashboard.",
  ],
  [/^(hi|hey|hello)\b/i, "Hey! What would you like to know?"],
];

const FALLBACK_REPLY =
  "Thanks! I've noted that — a teammate will follow up with the details.";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Send one visitor message and return the assistant's reply text. */
export async function sendChatMessage(text: string): Promise<string> {
  if (USE_FAKE_REPLIES) {
    await wait(700);
    return (
      FAKE_REPLIES.find(([match]) => match.test(text))?.[1] ?? FALLBACK_REPLY
    );
  }

  const { reply } = await call(endpoints.chat.sendMessage, { text });
  return reply;
}
