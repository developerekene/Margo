import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { ArrowUpIcon } from "../Components/Icons";
import {
  chatbotConfig,
  initialMessages,
  sendChatMessage,
  type ChatbotConfig,
  type ChatMessage,
} from "./chatbotdata";

type MessageProps = { text: string; config: ChatbotConfig };

/** Assistant bubble — avatar plus a bubble on the configured side. */
export function BotMessage({ text, config }: MessageProps) {
  return (
    <Bubble
      text={text}
      avatar={config.botAvatar}
      name={config.title}
      side={config.botSide}
      background={config.botColor}
      color="#1f2933"
    />
  );
}

/** Visitor bubble — always the opposite side to the assistant. */
export function UserMessage({ text, config }: MessageProps) {
  return (
    <Bubble
      text={text}
      avatar={config.userAvatar}
      name="You"
      side={config.botSide === "left" ? "right" : "left"}
      background={config.userColor}
      color="#ffffff"
    />
  );
}

export function ChatHeader({ config }: { config: ChatbotConfig }) {
  return (
    <header
      className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"
      style={{ backgroundColor: config.headerColor }}
    >
      <div className="flex items-center gap-2.5">
        <Avatar source={config.botAvatar} />
        <div className="leading-tight">
          <p className="text-[13px] font-semibold text-ink-900">
            {config.title}
          </p>
          <p className="text-[11px] text-ink-400">{config.subtitle}</p>
        </div>
      </div>

      <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-ink-500">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: config.accentColor }}
        />
        Online
      </span>
    </header>
  );
}

export function ChatInput({
  config,
  disabled,
  onSend,
}: {
  config: ChatbotConfig;
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!value || disabled) return;

    onSend(value);
    setText("");
  }

  return (
    <form
      className="flex items-center gap-2 border-t border-line px-3 py-3"
      onSubmit={handleSubmit}
    >
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={config.placeholder}
        aria-label="Message"
        disabled={disabled}
        className="h-10 flex-1 rounded-lg border border-line px-3.5 text-[13.5px] text-ink-900 caret-brand-500 outline-none transition-colors placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-slate-50"
      />

      <button
        type="submit"
        aria-label="Send message"
        disabled={disabled || !text.trim()}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ backgroundColor: config.accentColor }}
      >
        <ArrowUpIcon className="h-4.5 w-4.5" />
      </button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

type BubbleProps = {
  text: string;
  avatar: string;
  name: string;
  side: "left" | "right";
  background: string;
  color: string;
};

/** Shared bubble: same markup on both sides, just mirrored. */
function Bubble({ text, avatar, name, side, background, color }: BubbleProps) {
  const isRight = side === "right";

  return (
    <div
      className={`flex items-end gap-2.5 ${isRight ? "flex-row-reverse" : ""}`}
    >
      <Avatar source={avatar} label={name} />
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

/** Emoji or image URL — images are lazy-loaded. */
function Avatar({ source, label }: { source: string; label?: string }) {
  const isImage = /^(https?:|\/|data:)/.test(source);

  return (
    <span
      aria-hidden="true"
      title={label}
      className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-white text-[14px]"
    >
      {isImage ? (
        <img
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        source
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function Chatbot() {
  const config = chatbotConfig;
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing]);

  async function handleSend(text: string) {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text },
    ]);
    setTyping(true);

    try {
      const reply = await sendChatMessage(text);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "bot", text: reply },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "bot",
          text: "Sorry — something went wrong. Please try again.",
        },
      ]);
    } finally {
      setTyping(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 sm:p-8">
      <div
        className="flex h-[600px] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line shadow-card"
        style={{ backgroundColor: config.backgroundColor }}
      >
        <ChatHeader config={config} />

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((message) =>
            message.role === "bot" ? (
              <BotMessage
                key={message.id}
                text={message.text}
                config={config}
              />
            ) : (
              <UserMessage
                key={message.id}
                text={message.text}
                config={config}
              />
            ),
          )}

          {typing ? (
            <div className="flex items-end gap-2.5">
              <Avatar source={config.botAvatar} />
              <span
                className="flex gap-1 rounded-2xl px-3.5 py-3"
                style={{
                  backgroundColor: config.botColor,
                  opacity: 0.6,
                }}
              >
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400"
                    style={{ animationDelay: `${index * 120}ms` }}
                  />
                ))}
              </span>
            </div>
          ) : null}

          <div ref={endRef} />
        </div>

        <ChatInput
          config={config}
          disabled={typing}
          onSend={(text) => void handleSend(text)}
        />
      </div>
    </div>
  );
}
