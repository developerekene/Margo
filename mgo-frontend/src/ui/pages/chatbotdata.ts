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
  /** Drives the widget shell — header, transcript and composer. */
  backgroundColor: string;
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
  accentColor: "#0a756c",
  welcomeMessage: "Hi! I'm the Margo assistant. Ask me anything about Margo.",
  placeholder: "Ask about Margo...",
};

/**
 * Black or white text for a bubble background, chosen from its luminance, so a
 * custom accent or message colour stays readable.
 */
export function readableTextOn(background: string): string {
  const hex = background.trim().replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : hex;

  if (!/^[0-9a-f]{6}$/i.test(full)) return "#1f2933";

  const [red, green, blue] = [0, 2, 4].map((offset) =>
    parseInt(full.slice(offset, offset + 2), 16),
  );

  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

  return luminance > 0.6 ? "#1f2933" : "#ffffff";
}

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
