import { useEffect, useRef, useState } from "react";

import { LuMessageCircle, LuX } from "react-icons/lu";
import { useDispatch, useSelector } from "react-redux";

import { messageAdded, typingChanged } from "../../Redux/Slices/chatslic";
import type { RootState } from "../../Redux/Store";
import { ChatbotAvatar, ChatbotHeader } from "../Components/ChatbotHeader";
import { ChatbotInput } from "../Components/ChatbotInput";
import { ChatbotBubble, ChatbotMessage } from "../Components/ChatbotMessage";
import {
  readableTextOn,
  sendChatMessage,
  type ChatbotConfig,
} from "./chatbotdata";

type MessageProps = { text: string; config: ChatbotConfig };

/** Visitor bubble — always the opposite side to the assistant. */
export function UserMessage({ text, config }: MessageProps) {
  return (
    <ChatbotBubble
      text={text}
      avatar={config.userAvatar}
      name="You"
      side={config.botSide === "left" ? "right" : "left"}
      background={config.userColor}
      color={readableTextOn(config.userColor)}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function Chatbot() {
  const config = useSelector((state: RootState) => state.agent);
  const dispatch = useDispatch();
  const messages = useSelector((state: RootState) => state.chat.messages);
  const typing = useSelector((state: RootState) => state.chat.typing);
  const [open, setOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing, open]);

  // Escape closes the widget.
  useEffect(() => {
    if (!open) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  async function handleSend(text: string) {
    dispatch(messageAdded("user", text));
    dispatch(typingChanged(true));

    try {
      const reply = await sendChatMessage(text);
      dispatch(messageAdded("bot", reply));
    } catch {
      dispatch(
        messageAdded("bot", "Sorry — something went wrong. Please try again."),
      );
    } finally {
      dispatch(typingChanged(false));
    }
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div
        id="margo-widget"
        role="dialog"
        aria-label={`${config.title} chat`}
        className={`fixed bottom-18 right-5 z-40 flex h-[560px] max-h-[calc(100dvh-9rem)] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-line shadow-card transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none invisible opacity-0"
        }`}
        style={{ backgroundColor: config.backgroundColor }}
      >
        <ChatbotHeader config={config} onClose={() => setOpen(false)} />

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((message) =>
            message.role === "bot" ? (
              <ChatbotMessage
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
              <ChatbotAvatar source={config.botAvatar} />
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

        <ChatbotInput
          config={config}
          disabled={typing}
          onSend={(text) => void handleSend(text)}
        />
      </div>

      {/* Launcher — sits at the bottom-left and toggles the widget. */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls="margo-widget"
        aria-label={open ? "Close chat" : "Open chat"}
        className="fixed bottom-5 right-5 z-50 flex h-10 w-10 items-center justify-center rounded-full text-white shadow-[0_16px_40px_-16px_rgba(10,117,108,0.75)] transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        style={{ backgroundColor: config.accentColor }}
      >
        {open ? (
          <LuX className="h-5 w-5" aria-hidden="true" />
        ) : (
          <LuMessageCircle className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
