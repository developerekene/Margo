import type { ChatbotConfig } from "../../pages/chatbotdata";
import { readableTextOn } from "../../pages/chatbotdata";
import { ChatbotAvatar } from "../ChatbotHeader";
import { ArrowUpIcon } from "../Icons";

type AgentPreviewProps = {
  config: ChatbotConfig;
  /** Overrides the config title so the editor can preview an unsaved name. */
  name?: string;
};

const EXAMPLE_QUESTION = "What services do you offer?";
const EXAMPLE_ANSWER =
  "We help businesses turn their website into an AI assistant that answers visitor questions instantly.";

/**
 * Compact, static preview of one agent's widget. Shared by the My Agents
 * preview modal and the editor so both always render the same configuration.
 */
export function AgentPreview({ config, name }: AgentPreviewProps) {
  const assistantName = (name ?? config.title).trim() || "Your assistant";
  const botLeft = config.botSide === "left";
  const onAccent = readableTextOn(config.accentColor);
  const greeting =
    config.welcomeMessage.trim() || "Hi! How can I help you today?";
  const assistantBubble = {
    backgroundColor: config.botColor,
    color: readableTextOn(config.botColor),
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <header
        className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-3"
        style={{ backgroundColor: config.backgroundColor }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ChatbotAvatar source={config.botAvatar} label={assistantName} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[12.5px] font-semibold text-ink-900">
              {assistantName}
            </p>
            <p className="text-[11px] text-ink-400">{config.subtitle}</p>
          </div>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[10.5px] font-medium text-ink-500">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: config.accentColor }}
            aria-hidden="true"
          />
          Online
        </span>
      </header>

      <div
        className="space-y-3 px-3.5 py-4"
        style={{ backgroundColor: config.backgroundColor }}
      >
        <div
          className={`flex items-end gap-2 ${botLeft ? "" : "flex-row-reverse"}`}
        >
          <ChatbotAvatar source={config.botAvatar} label={assistantName} />
          <p
            className="max-w-[84%] rounded-2xl rounded-bl-md border border-line px-3 py-2 text-[12.5px] leading-relaxed"
            style={assistantBubble}
          >
            {greeting}
          </p>
        </div>

        <div
          className={`flex items-end gap-2 ${botLeft ? "flex-row-reverse" : ""}`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[13px] ring-1 ring-line">
            {config.userAvatar}
          </span>
          <p
            className="max-w-[84%] rounded-2xl rounded-br-md px-3 py-2 text-[12.5px] leading-relaxed"
            style={{ backgroundColor: config.accentColor, color: onAccent }}
          >
            {EXAMPLE_QUESTION}
          </p>
        </div>

        <div
          className={`flex items-end gap-2 ${botLeft ? "" : "flex-row-reverse"}`}
        >
          <ChatbotAvatar source={config.botAvatar} label={assistantName} />
          <p
            className="max-w-[84%] rounded-2xl rounded-bl-md border border-line px-3 py-2 text-[12.5px] leading-relaxed"
            style={assistantBubble}
          >
            {EXAMPLE_ANSWER}
          </p>
        </div>
      </div>

      <div
        className="flex items-center gap-2 border-t border-line px-3 py-3"
        style={{ backgroundColor: config.backgroundColor }}
      >
        <span className="h-9 flex-1 truncate rounded-lg border border-line px-3 py-2 text-[13px] text-ink-400">
          {config.placeholder || "Type a message…"}
        </span>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: config.accentColor, color: onAccent }}
          aria-hidden="true"
        >
          <ArrowUpIcon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
