import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type NotificationKind =
  | "page"
  | "chatbot"
  | "payment"
  | "payment_failed"
  | "team";

export type NotificationDetail = { label: string; value: string };

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** ISO timestamp. */
  createdAt: string;
  read: boolean;
  /** Extra rows shown on the notification page. */
  details: NotificationDetail[];
  /** Related dashboard section, if any. */
  href?: string;
};

/** Short label for the notification's area. */
export const KIND_LABELS: Record<NotificationKind, string> = {
  page: "Knowledge page",
  chatbot: "Chatbot",
  payment: "Payment",
  payment_failed: "Payment",
  team: "Team",
};

/* -------------------------------------------------------------------------- */
/* Seed data — replace with the notifications API when it exists               */
/* -------------------------------------------------------------------------- */

const seedNotifications: AppNotification[] = [
  {
    id: "ntf_01",
    kind: "payment",
    title: "Payment successful",
    body: "Business plan (Annual) — $421.20 was charged to your Visa ending 4242.",
    createdAt: "2026-11-03T08:12:00.000Z",
    read: false,
    href: "/dashboard/billing",
    details: [
      { label: "Invoice", value: "MG-2026-1042" },
      { label: "Plan", value: "Business · Annual" },
      { label: "Amount", value: "$421.20" },
      { label: "Method", value: "Visa •••• 4242" },
    ],
  },
  {
    id: "ntf_02",
    kind: "chatbot",
    title: "Chatbot updated",
    body: "You changed the greeting and accent colour for “Margo sales assistant”.",
    createdAt: "2026-11-02T15:40:00.000Z",
    read: false,
    href: "/dashboard/agent",
    details: [
      { label: "Chatbot", value: "Margo sales assistant" },
      { label: "Change", value: "Greeting, accent colour" },
      { label: "Status", value: "Published" },
    ],
  },
  {
    id: "ntf_03",
    kind: "team",
    title: "New team member",
    body: "Amina Bello accepted your invitation and joined as Agent manager.",
    createdAt: "2026-11-02T10:05:00.000Z",
    read: false,
    href: "/dashboard/team",
    details: [
      { label: "Member", value: "Amina Bello" },
      { label: "Email", value: "amina@margo.com" },
      { label: "Role", value: "Agent manager" },
    ],
  },
  {
    id: "ntf_04",
    kind: "page",
    title: "New page created",
    body: "“Pricing” was added to your knowledge base and is ready to answer questions.",
    createdAt: "2026-11-01T17:22:00.000Z",
    read: false,
    href: "/dashboard/knowledge",
    details: [
      { label: "Page", value: "/pricing" },
      { label: "Source", value: "Website crawl" },
      { label: "Status", value: "Indexed" },
    ],
  },
  {
    id: "ntf_05",
    kind: "chatbot",
    title: "New chatbot created",
    body: "“Margo support bot” was created and saved as a draft.",
    createdAt: "2026-10-31T12:10:00.000Z",
    read: true,
    href: "/dashboard/agent",
    details: [
      { label: "Chatbot", value: "Margo support bot" },
      { label: "Website", value: "https://margo.com" },
      { label: "Status", value: "Draft" },
    ],
  },
  {
    id: "ntf_06",
    kind: "payment_failed",
    title: "Payment failed",
    body: "We couldn't charge $39.00 to your Visa ending 4242. Update your card to keep the Business plan active.",
    createdAt: "2026-10-30T07:58:00.000Z",
    read: true,
    href: "/dashboard/billing",
    details: [
      { label: "Invoice", value: "MG-2026-0931" },
      { label: "Plan", value: "Business · Monthly" },
      { label: "Amount", value: "$39.00" },
      { label: "Reason", value: "Card declined" },
    ],
  },
  {
    id: "ntf_07",
    kind: "payment",
    title: "Payment successful",
    body: "Business plan (Monthly) — $39.00 was paid with your Visa ending 4242.",
    createdAt: "2026-09-28T08:02:00.000Z",
    read: true,
    href: "/dashboard/billing",
    details: [
      { label: "Invoice", value: "MG-2026-1017" },
      { label: "Plan", value: "Business · Monthly" },
      { label: "Amount", value: "$39.00" },
      { label: "Method", value: "Visa •••• 4242" },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** "Just now", "12m ago", "3h ago", "2d ago", then a short date. */
export function formatRelativeTime(iso: string, now = Date.now()) {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60_000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

/* -------------------------------------------------------------------------- */
/* Slice                                                                      */
/* -------------------------------------------------------------------------- */

type NotificationsState = {
  items: AppNotification[];
};

const initialState: NotificationsState = { items: seedNotifications };

const notificationsSlice = createSlice({
  name: "notifications",
  initialState,

  reducers: {
    /** Mark one notification as read. */
    notificationRead(state, action: PayloadAction<string>) {
      const notification = state.items.find(
        (item) => item.id === action.payload,
      );
      if (notification) notification.read = true;
    },

    /** Remove one notification. */
    notificationDeleted(state, action: PayloadAction<string>) {
      state.items = state.items.filter((item) => item.id !== action.payload);
    },

    /** Mark every notification as read. */
    notificationsAllRead(state) {
      state.items.forEach((item) => {
        item.read = true;
      });
    },

    /** Remove only the notifications that have been read. */
    notificationsReadDeleted(state) {
      state.items = state.items.filter((item) => !item.read);
    },

    /** Remove everything. */
    notificationsAllDeleted(state) {
      state.items = [];
    },

    /** Restore the demo notifications. */
    notificationsReset(state) {
      state.items = seedNotifications;
    },
  },
});

export const {
  notificationRead,
  notificationDeleted,
  notificationsAllRead,
  notificationsReadDeleted,
  notificationsAllDeleted,
  notificationsReset,
} = notificationsSlice.actions;

export default notificationsSlice.reducer;
