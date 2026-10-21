import { useEffect, useRef } from "react";

import { LuClock, LuX } from "react-icons/lu";

import { StatusBadge, type Company, type Conversation } from "./CompanyTable";

type CompanyDetailsModalProps = {
  company: Company;
  onClose: () => void;
};

/** Read-only details for one company. Escape and the backdrop both close it. */
export function CompanyDetailsModal({
  company,
  onClose,
}: CompanyDetailsModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const rows = [
    { label: "Plan", value: company.plan },
    { label: "Role", value: company.role },
    { label: "AI agents", value: String(company.agents) },
    { label: "Conversations", value: company.conversations.toLocaleString() },
    { label: "Revenue", value: company.revenue },
    { label: "Customer since", value: company.joined },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/30"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="company-details-title"
        className="relative w-full max-w-md rounded-xl border border-line bg-white p-5 shadow-card"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="company-details-title"
              className="truncate text-[15px] font-semibold text-ink-900"
            >
              {company.name}
            </h2>
            <p className="mt-1 truncate text-[12.5px] text-ink-500">
              {company.website}
            </p>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close company details"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LuX className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4">
          <StatusBadge status={company.status} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-[11px] font-medium tracking-[0.06em] text-ink-400 uppercase">
                {row.label}
              </dt>
              <dd className="mt-0.5 text-[13.5px] text-ink-900">{row.value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 text-[12px] leading-relaxed text-ink-400">
          Sample data for layout preview — not connected to a live backend.
        </p>
      </div>
    </div>
  );
}



/**
 * Conversation details — the full visitor transcript for the row opened from the
 * conversations table. It behaves like the company modal above: focus moves to
 * the close button, Escape and the backdrop both close it, and the page behind
 * is locked while it is open.
 */
export function ConversationModal({
  conversation,
  onClose,
}: {
  conversation: Conversation;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/30"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-title"
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-line bg-white shadow-card"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <h2
              id="conversation-title"
              className="truncate font-mono text-[13.5px] font-semibold text-ink-900"
            >
              {conversation.visitorId}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-500">
              <StatusBadge status={conversation.status} />
              <span>
                {conversation.date} · {conversation.time}
              </span>
            </p>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close conversation"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LuX className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <ol className="space-y-3 overflow-y-auto p-5">
          {conversation.transcript.map((line, index) => (
            <li
              key={`${conversation.id}-${index}`}
              className={`flex flex-col ${
                line.role === "visitor" ? "items-end" : "items-start"
              }`}
            >
              <span
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  line.role === "visitor"
                    ? "bg-brand-500 text-white"
                    : "border border-line bg-slate-50 text-ink-900"
                }`}
              >
                {line.text}
              </span>
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-400">
                <LuClock className="h-3 w-3" aria-hidden="true" />
                {line.time}
              </span>
            </li>
          ))}
        </ol>

        <p className="border-t border-line p-5 pt-3 text-[12px] text-ink-400">
          Sample transcript for layout preview — history is not stored yet.
        </p>
      </div>
    </div>
  );
}
