import { LuX } from "react-icons/lu";

import type { ChatbotConfig } from "../pages/chatbotdata";

/** Emoji or image URL — images are lazy-loaded. */
export function ChatbotAvatar({
  source,
  label,
}: {
  source: string;
  label?: string;
}) {
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

type ChatbotHeaderProps = {
  config: ChatbotConfig;
  /** Renders a cancel button that closes the widget. */
  onClose?: () => void;
};

/** Widget header — assistant name, status and brand accent. */
export function ChatbotHeader({ config, onClose }: ChatbotHeaderProps) {
  return (
    <header
      className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"
      style={{ backgroundColor: config.backgroundColor }}
    >
      <div className="flex items-center gap-2.5">
        <ChatbotAvatar source={config.botAvatar} />
        <div className="leading-tight">
          <p className="text-[13px] font-semibold text-ink-900">
            {config.title}
          </p>
          <p className="text-[11px] text-ink-400">{config.subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-ink-500">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: config.accentColor }}
          />
          Online
        </span>

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900"
          >
            <LuX className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </header>
  );
}
