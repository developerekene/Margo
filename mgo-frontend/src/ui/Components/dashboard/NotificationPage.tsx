import { useState } from "react";

import type { IconType } from "react-icons";
import {
  LuArrowLeft,
  LuArrowRight,
  LuBot,
  LuCheck,
  LuCircleAlert,
  LuCircleCheck,
  LuFileText,
  LuInbox,
  LuTrash2,
  LuUsers,
} from "react-icons/lu";
import { useDispatch, useSelector } from "react-redux";
import { Link, useSearchParams } from "react-router-dom";

import {
  formatRelativeTime,
  notificationDeleted,
  notificationRead,
  notificationsAllRead,
} from "../../../Redux/Slices/notificationslic";
import type {
  AppNotification,
  NotificationKind,
} from "../../../Redux/Slices/notificationslic";
import { KIND_LABELS } from "../../../Redux/Slices/notificationslic";
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

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function KindIcon({ kind }: { kind: NotificationKind }) {
  const Icon = KIND_ICON[kind];

  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${KIND_TONE[kind]}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Details panel                                                              */
/* -------------------------------------------------------------------------- */

function NotificationDetails({
  notification,
  onBack,
  onDeleted,
}: {
  notification: AppNotification;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const dispatch = useDispatch();

  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-soft">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-500 transition-colors hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 lg:hidden"
      >
        <LuArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to notifications
      </button>

      <div className="flex items-start gap-3">
        <KindIcon kind={notification.kind} />

        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-medium tracking-[0.06em] text-ink-400 uppercase">
            {KIND_LABELS[notification.kind]}
          </p>
          <h3 className="mt-0.5 text-[14px] font-semibold text-ink-900">
            {notification.title}
          </h3>
          <p className="mt-1 text-[11px] text-ink-400">
            {dateTimeFormat.format(new Date(notification.createdAt))} ·{" "}
            {formatRelativeTime(notification.createdAt)}
          </p>
        </div>

        {notification.read ? null : (
          <span className="shrink-0 rounded-full border border-brand-500/20 bg-brand-500/10 px-2 py-0.5 text-[10.5px] font-medium text-brand-700">
            Unread
          </span>
        )}
      </div>

      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-700">
        {notification.body}
      </p>

      <dl className="mt-3 divide-y divide-line rounded-lg border border-line">
        {notification.details.map((detail) => (
          <div
            key={detail.label}
            className="flex items-start justify-between gap-3 px-3 py-2"
          >
            <dt className="text-[11.5px] text-ink-500">{detail.label}</dt>
            <dd className="text-right text-[12px] font-medium text-ink-900">
              {detail.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {notification.read ? null : (
          <button
            type="button"
            onClick={() => dispatch(notificationRead(notification.id))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LuCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Mark as read
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            dispatch(notificationDeleted(notification.id));
            onDeleted();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-[12px] font-medium text-red-600 transition-colors hover:border-red-200 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <LuTrash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Delete
        </button>
      </div>

      {notification.href ? (
        <Link
          to={notification.href}
          className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-600 transition-colors hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          Open {KIND_LABELS[notification.kind]}
          <LuArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Notification page — every notification with its full details. Selecting one
 * stores its id in `?id=` so the details panel is linkable and survives reload
 * of the dashboard shell.
 */
export function NotificationPage() {
  const dispatch = useDispatch();
  const items = useSelector((state: RootState) => state.notifications.items);
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const selectedId = params.get("id");
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const unread = items.filter((item) => !item.read).length;

  const visible = (
    filter === "unread" ? items.filter((item) => !item.read) : items
  )
    .slice()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  function select(notification: AppNotification) {
    dispatch(notificationRead(notification.id));
    setParams({ id: notification.id });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section
        className={`rounded-xl border border-line bg-white shadow-soft ${
          selected ? "hidden lg:block" : ""
        }`}
      >
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="inline-flex rounded-lg border border-line p-0.5">
            {(["all", "unread"] as const).map((option) => {
              const active = filter === option;

              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(option)}
                  className={`rounded-[9px] px-3 py-1.5 text-[12px] font-medium capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                    active
                      ? "bg-brand-500 text-white"
                      : "text-ink-500 hover:text-ink-900"
                  }`}
                >
                  {option}
                  {option === "unread" && unread > 0 ? ` (${unread})` : ""}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => dispatch(notificationsAllRead())}
            disabled={unread === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-ink-400 disabled:hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LuCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Mark all as read
          </button>
        </header>

        {visible.length ? (
          <ul className="divide-y divide-line">
            {visible.map((notification) => (
              <li key={notification.id}>
                <div
                  className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50/70 ${
                    notification.read ? "" : "bg-brand-50/40"
                  } ${selectedId === notification.id ? "ring-1 ring-inset ring-brand-200" : ""}`}
                >
                  <KindIcon kind={notification.kind} />

                  <button
                    type="button"
                    onClick={() => select(notification)}
                    className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-ink-900">
                        {notification.title}
                      </span>
                      {notification.read ? null : (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500"
                          aria-label="Unread"
                        />
                      )}
                    </span>

                    <span className="mt-0.5 line-clamp-2 block text-[12px] leading-relaxed text-ink-500">
                      {notification.body}
                    </span>

                    <span className="mt-1 block text-[11px] text-ink-400">
                      {KIND_LABELS[notification.kind]} ·{" "}
                      {formatRelativeTime(notification.createdAt)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      dispatch(notificationDeleted(notification.id));
                      if (selectedId === notification.id) setParams({});
                    }}
                    aria-label={`Delete ${notification.title}`}
                    title="Delete"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                  >
                    <LuTrash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-16 text-center">
            <LuInbox
              className="mx-auto h-6 w-6 text-ink-400"
              aria-hidden="true"
            />
            <p className="mt-2 text-[13px] font-medium text-ink-700">
              {filter === "unread"
                ? "No unread notifications"
                : "You're all caught up"}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-400">
              Page, chatbot, billing and team activity will show up here.
            </p>
          </div>
        )}
      </section>

      <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
        {selected ? (
          <NotificationDetails
            key={selected.id}
            notification={selected}
            onBack={() => setParams({})}
            onDeleted={() => setParams({})}
          />
        ) : (
          <div className="hidden rounded-xl border border-dashed border-line-strong bg-slate-50/60 px-4 py-10 text-center lg:block">
            <p className="text-[12.5px] font-medium text-ink-700">
              Select a notification
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-400">
              Its full details will appear here.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
