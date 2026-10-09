import { useState } from "react";
import type { FormEvent } from "react";

import type { ChatbotConfig } from "../pages/chatbotdata";
import { ArrowUpIcon } from "./Icons";

type ChatbotInputProps = {
  config: ChatbotConfig;
  disabled: boolean;
  onSend: (text: string) => void;
};

/** Footer composer — message field plus a send button tinted with the accent. */
export function ChatbotInput({ config, disabled, onSend }: ChatbotInputProps) {
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
      style={{ backgroundColor: config.backgroundColor }}
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
