import {
  LuActivity,
  LuBookOpen,
  LuBot,
  LuBuilding2,
  LuGlobe,
  LuMessageSquare,
  LuWallet,
} from "react-icons/lu";

import type { Company, Conversation } from "./CompanyTable";
import type { Transaction } from "./BillingTransaction";

/**
 * Mock data for the dashboard — and it onlt for margo.
 */

export const REVENUE = {
  label: "Total revenue",
  value: "₦120,000",
  change: "+12.4%",
  hint: "vs. last month",
  icon: LuWallet,
};

export const METRICS = [
  {
    label: "Total companies",
    value: "48",
    hint: "6 new this month",
    icon: LuBuilding2,
  },
  {
    label: "Active AI agents",
    value: "126",
    hint: "Across all plans",
    icon: LuBot,
  },
  {
    label: "Total conversations",
    value: "18,402",
    hint: "Last 30 days",
    icon: LuMessageSquare,
  },
  {
    label: "Website visitors",
    value: "92,750",
    hint: "Last 30 days",
    icon: LuGlobe,
  },
];

export const COMPANIES: Company[] = [
  {
    id: "acme-logistics",
    name: "Acme Logistics",
    plan: "Growth",
    role: "Owner",
    status: "active",
    website: "acmelogistics.com",
    agents: 3,
    conversations: 1284,
    revenue: "₦48,000",
    joined: "12 Aug 2026",
  },
  {
    id: "brightpath-academy",
    name: "Brightpath Academy",
    plan: "Starter",
    role: "Admin",
    status: "active",
    website: "brightpath.school",
    agents: 1,
    conversations: 412,
    revenue: "₦12,000",
    joined: "03 Sep 2026",
  },
  {
    id: "harbourline-legal",
    name: "Harbourline Legal",
    plan: "Growth",
    role: "Member",
    status: "pending",
    website: "harbourlinelaw.com",
    agents: 2,
    conversations: 0,
    revenue: "₦0",
    joined: "21 Sep 2026",
  },
  {
    id: "zenith-fitness",
    name: "Zenith Fitness",
    plan: "Starter",
    role: "Owner",
    status: "suspended",
    website: "zenithfitness.ng",
    agents: 0,
    conversations: 96,
    revenue: "₦6,000",
    joined: "17 Jul 2026",
  },
  {
    id: "coastal-foods",
    name: "Coastal Foods",
    plan: "Scale",
    role: "Admin",
    status: "active",
    website: "coastalfoods.com",
    agents: 5,
    conversations: 3208,
    revenue: "₦40,000",
    joined: "02 Jun 2026",
  },
  {
    id: "northgate-realty",
    name: "Northgate Realty",
    plan: "Growth",
    role: "Member",
    status: "pending",
    website: "northgaterealty.com",
    agents: 1,
    conversations: 57,
    revenue: "₦14,000",
    joined: "28 Sep 2026",
  },
];

/**
 * Mock data for the dashboard — and it onlt for company.
 */

export const FEATURED_METRIC = {
  label: "Total conversations",
  value: "1,842",
  change: "+8.2%",
  hint: "vs. previous 30 days",
  icon: LuMessageSquare,
};

export const COMPANYMETRICS = [
  {
    label: "Website visitors",
    value: "9,120",
    hint: "Sample — analytics not connected",
    icon: LuGlobe,
  },
  {
    label: "AI resolution rate",
    value: "—",
    hint: "Not measured yet",
    icon: LuActivity,
  },
  {
    label: "Knowledge sources",
    value: "0",
    hint: "Add a website or documents",
    icon: LuBookOpen,
  },
  {
    label: "Agent status",
    value: "Not live",
    hint: "Finish setup to launch",
    icon: LuBot,
  },
];

export const CONVERSATIONS: Conversation[] = [
  {
    id: "c-2041",
    visitorId: "visitor_8f21",
    firstMessage: "Do you deliver to Abuja?",
    agent: "Margo assistant",
    date: "13 Oct 2026",
    time: "09:42",
    status: "resolved",
    transcript: [
      { role: "visitor", text: "Do you deliver to Abuja?", time: "09:42" },
      {
        role: "agent",
        text: "Yes — we deliver to Abuja within 2–3 working days.",
        time: "09:42",
      },
      { role: "visitor", text: "Perfect, thank you.", time: "09:43" },
    ],
  },
  {
    id: "c-2040",
    visitorId: "visitor_2b90",
    firstMessage: "Can I change my plan mid-month?",
    agent: "Margo assistant",
    date: "13 Oct 2026",
    time: "08:15",
    status: "active",
    transcript: [
      {
        role: "visitor",
        text: "Can I change my plan mid-month?",
        time: "08:15",
      },
      {
        role: "agent",
        text: "You can switch plans at any time — the difference is prorated.",
        time: "08:15",
      },
      { role: "visitor", text: "And if I downgrade?", time: "08:17" },
    ],
  },
  {
    id: "c-2039",
    visitorId: "visitor_77ac",
    firstMessage: "What is your refund policy?",
    agent: "Margo assistant",
    date: "12 Oct 2026",
    time: "17:58",
    status: "unanswered",
    transcript: [
      { role: "visitor", text: "What is your refund policy?", time: "17:58" },
      {
        role: "agent",
        text: "I don't have that in my knowledge yet — I've flagged it for the team.",
        time: "17:58",
      },
    ],
  },
  {
    id: "c-2038",
    visitorId: "visitor_5c33",
    firstMessage: "Do you offer annual billing?",
    agent: "Margo assistant",
    date: "12 Oct 2026",
    time: "14:22",
    status: "resolved",
    transcript: [
      { role: "visitor", text: "Do you offer annual billing?", time: "14:22" },
      { role: "agent", text: "Yes, annual billing saves 20%.", time: "14:22" },
    ],
  },
  {
    id: "c-2037",
    visitorId: "visitor_1d08",
    firstMessage: "Where can I find the setup guide?",
    agent: "Margo assistant",
    date: "11 Oct 2026",
    time: "11:04",
    status: "resolved",
    transcript: [
      {
        role: "visitor",
        text: "Where can I find the setup guide?",
        time: "11:04",
      },
      {
        role: "agent",
        text: "It's on the Widget Customization page, under Embed code.",
        time: "11:04",
      },
    ],
  },
  {
    id: "c-2036",
    visitorId: "visitor_9a47",
    firstMessage: "Can I talk to a human?",
    agent: "Margo assistant",
    date: "11 Oct 2026",
    time: "09:31",
    status: "unanswered",
    transcript: [
      { role: "visitor", text: "Can I talk to a human?", time: "09:31" },
      {
        role: "agent",
        text: "Of course — a teammate will follow up by email.",
        time: "09:31",
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Sample data — swap for the billing API when it exists                      */
/* -------------------------------------------------------------------------- */

export const TRANSACTIONS: Transaction[] = [
  {
    id: "txn_1042",
    invoiceNo: "MG-2026-1042",
    status: "paid",
    amount: 421.2,
    plan: "Business",
    cycle: "annual",
    createdAt: "2026-10-28T09:14:00.000Z",
    periodStart: "2026-11-28T00:00:00.000Z",
    periodEnd: "2027-11-28T00:00:00.000Z",
    email: "margo@gmail.com",
    method: { brand: "visa", last4: "4242" },
    items: [
      {
        label: "Business plan",
        description: "Annual subscription",
        amount: 468,
      },
    ],
    discount: { label: "Annual discount (10%)", amount: 46.8 },
  },
  {
    id: "txn_1017",
    invoiceNo: "MG-2026-1017",
    status: "paid",
    amount: 39,
    plan: "Business",
    cycle: "monthly",
    createdAt: "2026-09-28T08:02:00.000Z",
    periodStart: "2026-09-28T00:00:00.000Z",
    periodEnd: "2026-10-28T00:00:00.000Z",
    email: "margo@gmail.com",
    method: { brand: "visa", last4: "4242" },
    items: [
      {
        label: "Business plan",
        description: "Monthly subscription",
        amount: 39,
      },
    ],
  },
  {
    id: "txn_0991",
    invoiceNo: "MG-2026-0991",
    status: "paid",
    amount: 19,
    plan: "Startups",
    cycle: "monthly",
    createdAt: "2026-08-28T10:23:00.000Z",
    periodStart: "2026-08-28T00:00:00.000Z",
    periodEnd: "2026-09-28T00:00:00.000Z",
    email: "margo@gmail.com",
    method: { brand: "mastercard", last4: "4444" },
    items: [
      {
        label: "Startups plan",
        description: "Monthly subscription",
        amount: 19,
      },
    ],
  },
  {
    id: "txn_0974",
    invoiceNo: "MG-2026-0974",
    status: "pending",
    amount: 99,
    plan: "Enterprise",
    cycle: "monthly",
    createdAt: "2026-08-02T16:45:00.000Z",
    periodStart: "2026-08-02T00:00:00.000Z",
    periodEnd: "2026-09-02T00:00:00.000Z",
    email: "margo@gmail.com",
    method: { brand: "amex", last4: "0005" },
    items: [
      {
        label: "Enterprise plan",
        description: "Monthly subscription",
        amount: 99,
      },
    ],
  },
  {
    id: "txn_0931",
    invoiceNo: "MG-2026-0931",
    status: "failed",
    amount: 39,
    plan: "Business",
    cycle: "monthly",
    createdAt: "2026-07-28T07:58:00.000Z",
    periodStart: "2026-07-28T00:00:00.000Z",
    periodEnd: "2026-08-28T00:00:00.000Z",
    email: "margo@gmail.com",
    method: { brand: "visa", last4: "4242" },
    items: [
      {
        label: "Business plan",
        description: "Monthly subscription",
        amount: 39,
      },
    ],
  },
  {
    id: "txn_0902",
    invoiceNo: "MG-2026-0902",
    status: "refunded",
    amount: 19,
    plan: "Startups",
    cycle: "monthly",
    createdAt: "2026-06-15T12:10:00.000Z",
    periodStart: "2026-06-15T00:00:00.000Z",
    periodEnd: "2026-07-15T00:00:00.000Z",
    email: "margo@gmail.com",
    method: { brand: "mastercard", last4: "4444" },
    items: [
      {
        label: "Startups plan",
        description: "Monthly subscription",
        amount: 19,
      },
    ],
  },
];
