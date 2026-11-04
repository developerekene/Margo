import { useEffect, useId, useRef, useState } from "react";

import { createPortal } from "react-dom";
import type { IconType } from "react-icons";
import {
  LuArrowRight,
  LuBell,
  LuBot,
  LuCheck,
  LuCircleAlert,
  LuCircleCheck,
  LuEllipsisVertical,
  LuFileText,
  LuInbox,
  LuTrash2,
  LuUsers,
  LuX,
} from "react-icons/lu";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import {
  formatRelativeTime,
  notificationDeleted,
  notificationRead,
  notificationsAllDeleted,
  notificationsAllRead,
  notificationsReadDeleted,
  notificationsReset,
} from "../../../Redux/Slices/notificationslic";
import type {
  AppNotification,
  NotificationKind,
} from "../../../Redux/Slices/notificationslic";
import type { RootState } from "../../../Redux/Store";

/* -------------------------------------------------------------------------- */
/* Presentation helpers                                                       */
/* -------------------------------------------------------------------------- */

const KIND_ICON: Record<NotificationKind, IconType> = {
  page: LuFileText,
  chatbot: LuBot,
  payment: LuCircleCheck,
  payment_failed: LuCircleAlert,
  team: LuUsers,
};

const KIND_TONE: Record<NotificationKind, string> = {
  page: "bg-brand-50 text-brand-600",
  chatbot: "bg-brand-50 text-brand-600",
  payment: "bg-emerald-50 text-emerald-600",
  payment_failed: "bg-red-50 text-red-600",
  team: "bg-blue-50 text-blue-600",
};

function NotificationIcon({ kind }: { kind: NotificationKind }) {
  const Icon = KIND_ICON[kind];

  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${KIND_TONE[kind]}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

function sortNewestFirst(items: AppNotification[]) {
  return [...items].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/* -------------------------------------------------------------------------- */
/* View-all modal (NotificationModel)                                         */
/* -------------------------------------------------------------------------- */

function MenuItem({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`block w-full px-3 py-2 text-left text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:text-ink-400 ${
        danger
          ? "text-red-600 hover:bg-red-50"
          : "text-ink-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

export function NotificationModel({
  open,
  onClose,
  onOpenNotification,
}: {
  open: boolean;
  onClose: () => void;
  onOpenNotification: (notification: AppNotification) => void;
}) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const items = useSelector((state: RootState) => state.notifications.items);

  const titleId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const ordered = sortNewestFirst(items);
  const readCount = items.filter((item) => item.read).length;

  // Lock the page and move focus into the dialog while it is open.
  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (menuOpen) {
        setMenuOpen(false);
        return;
      }

      onClose();
    }

    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, menuOpen, onClose]);

  // Close the three-dot menu on an outside click.
  useEffect(() => {
    if (!menuOpen) return;

    function handlePointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [menuOpen]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-3 sm:items-center sm:p-6">
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[86vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <header className="flex items-center gap-2 border-b border-line px-3 py-3">
          {/* Three-dot actions, top-left as requested */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Notification actions"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <LuEllipsisVertical className="h-4 w-4" aria-hidden="true" />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute top-full left-0 z-50 mt-1 w-48 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-xl"
              >
                <MenuItem
                  onClick={() => {
                    dispatch(notificationsAllRead());
                    setMenuOpen(false);
                  }}
                  disabled={items.every((item) => item.read)}
                >
                  Mark all as read
                </MenuItem>

                <MenuItem
                  onClick={() => {
                    dispatch(notificationsReadDeleted());
                    setMenuOpen(false);
                  }}
                  disabled={readCount === 0}
                >
                  Delete all read
                </MenuItem>

                <MenuItem
                  danger
                  onClick={() => {
                    dispatch(notificationsAllDeleted());
                    setMenuOpen(false);
                  }}
                  disabled={items.length === 0}
                >
                  Delete all
                </MenuItem>
              </div>
            ) : null}
          </div>

          <h2
            id={titleId}
            className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink-900"
          >
            Notifications
          </h2>

          <span className="shrink-0 text-[11px] text-ink-400">
            {items.length} total
          </span>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LuX className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {ordered.length ? (
            <ul className="divide-y divide-line">
              {ordered.map((notification) => (
                <li
                  key={notification.id}
                  className={`flex items-start gap-2.5 px-3 py-3 transition-colors ${
                    notification.read ? "bg-white" : "bg-brand-50/40"
                  }`}
                >
                  <NotificationIcon kind={notification.kind} />

                  <button
                    type="button"
                    onClick={() => onOpenNotification(notification)}
                    className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[12.5px] font-semibold text-ink-900">
                        {notification.title}
                      </span>
                      {notification.read ? null : (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500"
                          aria-label="Unread"
                        />
                      )}
                    </span>

                    <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-relaxed text-ink-500">
                      {notification.body}
                    </span>

                    <span className="mt-1 block text-[10.5px] text-ink-400">
                      {formatRelativeTime(notification.createdAt)}
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    {notification.read ? null : (
                      <button
                        type="button"
                        onClick={() =>
                          dispatch(notificationRead(notification.id))
                        }
                        aria-label={`Mark ${notification.title} as read`}
                        title="Mark as read"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                      >
                        <LuCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        dispatch(notificationDeleted(notification.id))
                      }
                      aria-label={`Delete ${notification.title}`}
                      title="Delete"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                    >
                      <LuTrash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-14 text-center">
              <LuInbox
                className="mx-auto h-6 w-6 text-ink-400"
                aria-hidden="true"
              />
              <p className="mt-2 text-[12.5px] font-medium text-ink-700">
                You're all caught up
              </p>
              <p className="mt-0.5 text-[11.5px] text-ink-400">
                New activity will show up here.
              </p>
              <button
                type="button"
                onClick={() => dispatch(notificationsReset())}
                className="mt-3 text-[11.5px] font-medium text-brand-600 transition-colors hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                Restore demo notifications
              </button>
            </div>
          )}
        </div>

        <footer className="border-t border-line px-3 py-2.5">
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate("/dashboard/notifications");
            }}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Open notification page
            <LuArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* Bell + first three notifications                                           */
/* -------------------------------------------------------------------------- */

/**
 * Header bell: opens a short list (first three) with a "View all" button that
 * opens the full NotificationModel.
 */
export function NotificationBell({ className = "" }: { className?: string }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const items = useSelector((state: RootState) => state.notifications.items);

  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);

  const unread = items.filter((item) => !item.read).length;
  const preview = sortNewestFirst(items).slice(0, 3);

  useEffect(() => {
    if (!open) return;

    function handlePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function openNotification(notification: AppNotification) {
    dispatch(notificationRead(notification.id));
    setOpen(false);
    setModelOpen(false);
    navigate(`/dashboard/notifications?id=${notification.id}`);
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-ink-500 transition-colors hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <LuBell className="h-4.5 w-4.5" aria-hidden="true" />

        {unread > 0 ? (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[9.5px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[320px] overflow-hidden rounded-xl border border-line bg-white shadow-xl sm:w-[360px]">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
            <p className="text-[12.5px] font-semibold text-ink-900">
              Notifications
            </p>
            <span className="text-[11px] text-ink-400">
              {unread} unread
            </span>
          </div>

          {preview.length ? (
            <ul className="divide-y divide-line">
              {preview.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 ${
                      notification.read ? "" : "bg-brand-50/40"
                    }`}
                  >
                    <NotificationIcon kind={notification.kind} />

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[12px] font-semibold text-ink-900">
                          {notification.title}
                        </span>
                        {notification.read ? null : (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500"
                            aria-label="Unread"
                          />
                        )}
                      </span>

                      <span className="mt-0.5 line-clamp-2 block text-[11px] leading-relaxed text-ink-500">
                        {notification.body}
                      </span>

                      <span className="mt-0.5 block text-[10.5px] text-ink-400">
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-[12px] text-ink-400">
              No notifications yet.
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setModelOpen(true);
            }}
            className="flex w-full items-center justify-center gap-1.5 border-t border-line bg-slate-50/60 px-3 py-2.5 text-[12px] font-semibold text-brand-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
          >
            View all
            <LuArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <NotificationModel
        open={modelOpen}
        onClose={() => setModelOpen(false)}
        onOpenNotification={openNotification}
      />
    </div>
  );
}
