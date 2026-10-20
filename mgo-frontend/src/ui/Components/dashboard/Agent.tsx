import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import type { IconType } from "react-icons";
import {
  LuCheck,
  LuCode,
  LuCopy,
  LuEllipsisVertical,
  LuEye,
  LuGlobe,
  LuPencil,
  LuPlus,
  LuTrash2,
  LuX,
} from "react-icons/lu";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import type {
  Agent as AgentRecord,
  AgentStatus,
} from "../../../Redux/Slices/agentslic";
import { agentRemoved } from "../../../Redux/Slices/agentslic";
import type { RootState } from "../../../Redux/Store";
import { ChatbotAvatar } from "../ChatbotHeader";
import { AgentPreview } from "./AgentPreview";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const WIDGET_SRC =
  typeof window === "undefined" ? "" : `${window.location.origin}/margo.js`;

/** Each agent gets its own `data-chatbot-id`, so embeds stay independent. */
function embedSnippet(agentId: string) {
  return `<script\n  src="${WIDGET_SRC}"\n  data-chatbot-id="${agentId}"\n  async>\n</script>`;
}

function StatusPill({ status }: { status: AgentStatus }) {
  const published = status === "published";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium ${
        published
          ? "border-brand-200 bg-brand-50 text-brand-700"
          : "border-line bg-slate-50 text-ink-500"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          published ? "bg-brand-500" : "bg-ink-400"
        }`}
        aria-hidden="true"
      />
      {published ? "Published" : "Draft"}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared dialog                                                              */
/* -------------------------------------------------------------------------- */

type DialogProps = {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
};

/** Accessible modal shell: Escape closes, focus is trapped, page scroll locks. */
function Dialog({
  labelledBy,
  onClose,
  children,
  maxWidth = "max-w-md",
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    panel?.querySelector<HTMLElement>(focusableSelector)?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panel) return;

      const items = panel.querySelectorAll<HTMLElement>(focusableSelector);
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl border border-line bg-white shadow-card ${maxWidth}`}
      >
        {children}
      </div>
    </div>
  );
}

function DialogHeader({
  id,
  title,
  description,
  onClose,
}: {
  id: string;
  title: string;
  description?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 id={id} className="truncate text-[15px] font-semibold text-ink-900">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
            {description}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close dialog"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <LuX className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modals                                                                     */
/* -------------------------------------------------------------------------- */

function EmbedModal({
  agent,
  onClose,
}: {
  agent: AgentRecord;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const snippet = embedSnippet(agent.id);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setFailed(false);
      setCopied(true);
    } catch {
      setCopied(false);
      setFailed(true);
    }
  }

  return (
    <Dialog
      labelledBy="agent-embed-title"
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <DialogHeader
        id="agent-embed-title"
        title="Get embed code"
        description={
          agent.website
            ? `Add ${agent.name} to ${agent.website}.`
            : `Add ${agent.name} to your website.`
        }
        onClose={onClose}
      />

      <div className="px-5 py-5">
        <p className="text-[13px] leading-relaxed text-ink-500">
          Paste this snippet before the closing{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px] text-ink-700">
            &lt;/body&gt;
          </code>{" "}
          tag on every page where the agent should appear.
        </p>

        <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-ink-900 p-4 text-[12.5px] leading-relaxed text-slate-100">
          <code>{snippet}</code>
        </pre>

        <p
          role="status"
          aria-live="polite"
          className="mt-2 min-h-[1.25rem] text-[12.5px] text-ink-400"
        >
          {failed
            ? "Copying failed — select the code and copy it manually."
            : ""}
        </p>

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-white px-4 py-2.5 text-[13px] font-semibold text-ink-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Close
          </button>

          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            {copied ? (
              <LuCheck className="h-4 w-4" aria-hidden="true" />
            ) : (
              <LuCopy className="h-4 w-4" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function PreviewModal({
  agent,
  onClose,
}: {
  agent: AgentRecord;
  onClose: () => void;
}) {
  return (
    <Dialog
      labelledBy="agent-preview-title"
      onClose={onClose}
      maxWidth="max-w-sm"
    >
      <DialogHeader
        id="agent-preview-title"
        title={agent.name}
        description={agent.description}
        onClose={onClose}
      />

      <div className="px-4 py-4">
        <AgentPreview config={agent.config} name={agent.name} />
        <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
          {agent.website
            ? `Preview of the saved configuration for ${agent.website}.`
            : "Preview of the saved configuration for this agent."}
        </p>
      </div>
    </Dialog>
  );
}

function DeleteAgentDialog({
  agent,
  onClose,
  onConfirm,
}: {
  agent: AgentRecord;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog labelledBy="agent-delete-title" onClose={onClose}>
      <div className="p-5">
        <h2
          id="agent-delete-title"
          className="text-[15px] font-semibold text-ink-900"
        >
          Delete “{agent.name}”?
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
          This permanently removes the agent, its saved settings and its embed
          code. This action can’t be undone.
        </p>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-white px-4 py-2.5 text-[13px] font-semibold text-ink-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            Delete agent
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

function MenuItem({
  icon: Icon,
  danger = false,
  onClick,
  children,
}: {
  icon: IconType;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 ${
        danger
          ? "text-red-600 hover:bg-red-50 focus-visible:outline-red-500"
          : "text-ink-700 hover:bg-slate-50 focus-visible:outline-brand-500"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </button>
  );
}

function AgentCard({
  agent,
  onCustomize,
  onEmbed,
  onPreview,
  onDelete,
}: {
  agent: AgentRecord;
  onCustomize: () => void;
  onEmbed: () => void;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close the menu on an outside click or Escape, and focus the first item
  // when it opens so it can be used with the keyboard.
  useEffect(() => {
    if (!menuOpen) return;

    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();

    function handlePointer(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  /** Arrow keys and Home/End move between menu items. */
  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (!items.length) return;

    const index = items.indexOf(document.activeElement as HTMLElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length].focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1].focus();
    }
  }

  /** Close the menu first, then run the selected action. */
  function run(action: () => void) {
    setMenuOpen(false);
    action();
  }

  return (
    <article className="relative flex flex-col rounded-2xl border border-line bg-white p-5 shadow-soft transition-shadow hover:shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50">
          <ChatbotAvatar source={agent.config.botAvatar} label={agent.name} />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold text-ink-900">
            {agent.name}
          </h2>
          <div className="mt-1.5">
            <StatusPill status={agent.status} />
          </div>
        </div>

        <div ref={menuRef} className="relative shrink-0">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={`Open actions for ${agent.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LuEllipsisVertical className="h-4 w-4" aria-hidden="true" />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              aria-label={`Actions for ${agent.name}`}
              onKeyDown={handleMenuKeyDown}
              className="absolute top-9 right-0 z-20 w-48 rounded-xl border border-line bg-white p-1 shadow-card"
            >
              <MenuItem icon={LuPencil} onClick={() => run(onCustomize)}>
                Edit
              </MenuItem>
              <MenuItem icon={LuCode} onClick={() => run(onEmbed)}>
                Get Embed Code
              </MenuItem>
              <MenuItem icon={LuEye} onClick={() => run(onPreview)}>
                Preview
              </MenuItem>

              <div className="my-1 border-t border-line" />

              <MenuItem danger icon={LuTrash2} onClick={() => run(onDelete)}>
                Delete
              </MenuItem>
            </div>
          ) : null}
        </div>
      </div>

      <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-[13px] leading-relaxed text-ink-500">
        {agent.description}
      </p>

      <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ink-400">
        <LuGlobe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {agent.website || "No website linked"}
        </span>
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button
          type="button"
          onClick={onCustomize}
          className="rounded-lg bg-brand-500 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          Customize
        </button>

        <button
          type="button"
          onClick={onPreview}
          className="rounded-lg border border-line bg-white px-3.5 py-2 text-[13px] font-semibold text-ink-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          Preview
        </button>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * My Agents — the list of saved agents, or an empty state that leads to the
 * creation flow. Navbar and sidebar live in the dashboard shell.
 */
export function Agent() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const agents = useSelector((state: RootState) => state.agents.items);

  const [preview, setPreview] = useState<AgentRecord | null>(null);
  const [embed, setEmbed] = useState<AgentRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AgentRecord | null>(null);

  function openCreate() {
    navigate("/dashboard/agent/new");
  }

  function openEditor(agentId: string) {
    navigate(`/dashboard/agent/${agentId}/edit`);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    dispatch(agentRemoved(pendingDelete.id));
    setPendingDelete(null);
  }

  if (!agents.length) {
    return (
      <section className="rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-6">
        <div className="rounded-xl border border-dashed border-line-strong bg-slate-50/60 px-6 py-16 text-center sm:py-24">
          <p className="mx-auto max-w-sm text-[14px] leading-relaxed text-ink-500">
            You haven’t created an agent yet. Create your first AI agent to get
            started.
          </p>

          <button
            type="button"
            onClick={openCreate}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LuPlus className="h-4 w-4" aria-hidden="true" />
            Create Agent
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-900">
              Your agents
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-500">
              {agents.length} {agents.length === 1 ? "agent" : "agents"} in this
              workspace.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LuPlus className="h-4 w-4" aria-hidden="true" />
            Create Agent
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onCustomize={() => openEditor(agent.id)}
              onEmbed={() => setEmbed(agent)}
              onPreview={() => setPreview(agent)}
              onDelete={() => setPendingDelete(agent)}
            />
          ))}
        </div>
      </div>

      {preview ? (
        <PreviewModal agent={preview} onClose={() => setPreview(null)} />
      ) : null}

      {embed ? (
        <EmbedModal agent={embed} onClose={() => setEmbed(null)} />
      ) : null}

      {pendingDelete ? (
        <DeleteAgentDialog
          agent={pendingDelete}
          onClose={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </>
  );
}
