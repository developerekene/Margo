import { readableTextOn, type ChatbotConfig } from "../pages/chatbotdata";
import { ChatbotAvatar } from "./ChatbotHeader";

type BubbleProps = {
  text: string;
  avatar: string;
  name: string;
  side: "left" | "right";
  background: string;
  color: string;
};

/** Shared bubble: same markup on both sides, just mirrored. */
export function ChatbotBubble({
  text,
  avatar,
  name,
  side,
  background,
  color,
}: BubbleProps) {
  const isRight = side === "right";

  return (
    <div
      className={`flex items-end gap-2.5 ${isRight ? "flex-row-reverse" : ""}`}
    >
      <ChatbotAvatar source={avatar} label={name} />
      <p
        className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap ${
          isRight ? "rounded-br-sm" : "rounded-bl-sm"
        }`}
        style={{ backgroundColor: background, color }}
      >
        {text}
      </p>
    </div>
  );
}

/** Assistant message — avatar plus a bubble on the configured side. */
export function ChatbotMessage({
  text,
  config,
}: {
  text: string;
  config: ChatbotConfig;
}) {
  return (
    <ChatbotBubble
      text={text}
      avatar={config.botAvatar}
      name={config.title}
      side={config.botSide}
      background={config.botColor}
      color={readableTextOn(config.botColor)}
    />
  );
}
