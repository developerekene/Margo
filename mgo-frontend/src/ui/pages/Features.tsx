import type { ReactNode } from "react";

import type { IconType } from "react-icons";
import {
  LuArrowRight,
  LuArrowUpRight,
  LuBookOpen,
  LuBot,
  LuCheck,
  LuCode,
  LuFileText,
  LuGlobe,
  LuMessagesSquare,
  LuShieldCheck,
  LuSparkles,
  LuUsers,
} from "react-icons/lu";
import { Link } from "react-router-dom";

import { Footer } from "../Components/Footer";
import { Navbar } from "../Components/Navbar";

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const PRIMARY_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_16px_40px_-18px_rgba(10,117,108,0.8)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

const SECONDARY_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-5 py-2.5 text-[13.5px] font-semibold text-ink-700 transition-colors hover:border-brand-200 hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

const PANEL =
  "overflow-hidden rounded-2xl border border-line bg-white shadow-card";

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

type Feature = {
  icon: IconType;
  title: string;
  description: string;
};

const FEATURES: Feature[] = [
  {
    icon: LuGlobe,
    title: "Learns from your website",
    description:
      "Point Margo at your site and it reads your pages — services, policies, product details — so the answers it gives use the words you already use.",
  },
  {
    icon: LuFileText,
    title: "Upload what you already have",
    description:
      "PDFs, guides and FAQs go into one knowledge base. Nothing needs rewriting, and you can add more whenever your business changes.",
  },
  {
    icon: LuSparkles,
    title: "Answers from your knowledge",
    description:
      "Replies are drawn from your own content instead of guesswork. If Margo doesn't know something, it says so — and you can teach it.",
  },
  {
    icon: LuCode,
    title: "One snippet, anywhere",
    description:
      "Copy a single embed line into your site. The chat widget loads quietly wherever you place it, without rebuilding a thing.",
  },
  {
    icon: LuBot,
    title: "Looks and sounds like you",
    description:
      "Set the name, greeting, personality, colors, avatar and position. Small details that make the assistant feel like part of your brand.",
  },
  {
    icon: LuShieldCheck,
    title: "Access you can trust",
    description:
      "Email-verified accounts, separate workspace data, and an approved domain list for your widget. Your knowledge stays yours.",
  },
];

const TEAM_POINTS = [
  "Invite teammates by email",
  "Owner, admin and member roles",
  "Per-teammate permissions",
  "Widget domains you approve",
  "Sign out of all devices",
  "Email-verified accounts",
];

const TRUST_POINTS = [
  "No credit card required",
  "Set up in minutes",
  "Change plans anytime",
];

/* -------------------------------------------------------------------------- */
/* Building blocks                                                            */
/* -------------------------------------------------------------------------- */

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-semibold tracking-[0.16em] text-brand-500 uppercase">
      {children}
    </span>
  );
}

function SectionIntro({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow: string;
  title: string;
  description: string;
  align?: "left" | "center";
}) {
  return (
    <div
      className={
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"
      }
    >
      <Eyebrow>{eyebrow}</Eyebrow>

      <h2 className="mt-3 text-[28px] font-semibold tracking-tight text-ink-900 sm:text-[34px]">
        {title}
      </h2>

      <p className="mt-3 text-[14.5px] leading-7 text-ink-500">{description}</p>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: Feature) {
  return (
    <div className="group rounded-2xl border border-line bg-white p-6 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[0_20px_50px_-25px_rgba(15,23,42,0.3)]">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-500 group-hover:text-white">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>

      <h3 className="mt-5 text-[15px] font-semibold text-ink-900">{title}</h3>

      <p className="mt-2 text-[13.5px] leading-6 text-ink-500">{description}</p>
    </div>
  );
}

function CheckLine({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-start gap-2.5 text-[13.5px] leading-6 text-ink-700">
      <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <LuCheck className="h-2.5 w-2.5" aria-hidden="true" />
      </span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}

function DeepDive({
  eyebrow,
  title,
  description,
  points,
  visual,
  reverse = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
      <div className={reverse ? "lg:order-2" : undefined}>
        <Eyebrow>{eyebrow}</Eyebrow>

        <h3 className="mt-3 text-[26px] font-semibold tracking-tight text-ink-900 sm:text-[30px]">
          {title}
        </h3>

        <p className="mt-3 max-w-xl text-[14px] leading-7 text-ink-500">
          {description}
        </p>

        <ul className="mt-5 space-y-2.5">
          {points.map((point) => (
            <li key={point}>
              <CheckLine>{point}</CheckLine>
            </li>
          ))}
        </ul>
      </div>

      <div className={reverse ? "lg:order-1" : undefined}>{visual}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Product previews                                                           */
/* -------------------------------------------------------------------------- */

function KnowledgeMock() {
  const sources = [
    {
      icon: LuGlobe,
      label: "margo.ai",
      meta: "Website · 42 pages",
    },
    {
      icon: LuFileText,
      label: "Pricing guide.pdf",
      meta: "PDF · 12 pages",
    },
    {
      icon: LuMessagesSquare,
      label: "Support FAQs",
      meta: "18 answers",
    },
  ];

  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2">
          <LuBookOpen className="h-4 w-4 text-brand-500" aria-hidden="true" />
          <p className="text-[13px] font-semibold text-ink-900">Knowledge</p>
        </div>

        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-medium text-brand-700">
          3 sources
        </span>
      </div>

      <div className="space-y-2.5 p-5">
        {sources.map(({ icon: Icon, label, meta }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-ink-500">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-ink-900">
                {label}
              </span>
              <span className="block truncate text-[11px] text-ink-400">
                {meta}
              </span>
            </span>

            <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-medium text-brand-700">
              Trained
            </span>
          </div>
        ))}
      </div>

      <p className="border-t border-line px-5 py-3 text-[11.5px] text-ink-400">
        Add a source whenever your business changes.
      </p>
    </div>
  );
}

function ChatMock() {
  return (
    <div className={PANEL}>
      <div className="flex items-center gap-2.5 bg-brand-500 px-5 py-3.5 text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
          <LuBot className="h-4 w-4" aria-hidden="true" />
        </span>

        <span>
          <span className="block text-[12.5px] font-semibold">Margo</span>
          <span className="block text-[10.5px] text-white/70">
            Usually replies instantly
          </span>
        </span>
      </div>

      <div className="space-y-3 bg-slate-50/70 p-5">
        <p className="max-w-[88%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-700 shadow-soft">
          Hi 👋 I'm Margo. Ask me anything about our plans, delivery or returns.
        </p>

        <p className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-500 px-3.5 py-2.5 text-[12px] leading-relaxed text-white">
          Do you deliver to Abuja?
        </p>

        <p className="max-w-[92%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-700 shadow-soft">
          Yes — we deliver across Abuja within 1–2 working days. Want me to
          check your area?
        </p>
      </div>

      <div className="flex items-center gap-2 border-t border-line bg-white px-4 py-3">
        <span className="flex-1 rounded-lg border border-line px-3 py-2 text-[11.5px] text-ink-400">
          Ask a question…
        </span>

        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
          <LuArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

function ConversationsMock() {
  const conversations = [
    {
      id: "Visitor #4821",
      message: "Do you deliver to Abuja?",
      time: "2 min ago",
      status: "Answered",
    },
    {
      id: "Visitor #4818",
      message: "How do I reset my password?",
      time: "18 min ago",
      status: "Answered",
    },
    {
      id: "Visitor #4809",
      message: "Can I get a refund on an annual plan?",
      time: "1 hr ago",
      status: "Open",
    },
  ];

  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <p className="text-[13px] font-semibold text-ink-900">Conversations</p>

        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-ink-500">
          Today
        </span>
      </div>

      <ul className="divide-y divide-line">
        {conversations.map((conversation) => (
          <li
            key={conversation.id}
            className="flex items-center gap-3 px-5 py-3.5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[10.5px] font-semibold text-brand-700">
              {conversation.id.slice(-2)}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-ink-900">
                {conversation.id}
              </span>
              <span className="block truncate text-[11.5px] text-ink-400">
                {conversation.message}
              </span>
            </span>

            <span className="hidden shrink-0 text-[10.5px] text-ink-400 sm:block">
              {conversation.time}
            </span>

            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                conversation.status === "Answered"
                  ? "bg-brand-50 text-brand-700"
                  : "bg-[#ffeacf] text-brand-800"
              }`}
            >
              {conversation.status}
            </span>
          </li>
        ))}
      </ul>

      <p className="border-t border-line px-5 py-3 text-[11.5px] text-ink-400">
        Every chat is saved with its full transcript.
      </p>
    </div>
  );
}

function TeamMock() {
  const members = [
    { name: "Amina Bello", email: "amina@margo.ai", role: "Owner" },
    { name: "Lina Okafor", email: "lina@margo.ai", role: "Admin" },
    { name: "Tunde Bello", email: "tunde@margo.ai", role: "Member" },
  ];

  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2">
          <LuUsers className="h-4 w-4 text-brand-500" aria-hidden="true" />
          <p className="text-[13px] font-semibold text-ink-900">Team</p>
        </div>

        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-ink-500">
          3 members
        </span>
      </div>

      <ul className="divide-y divide-line">
        {members.map((member) => (
          <li
            key={member.email}
            className="flex items-center gap-3 px-5 py-3.5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[10.5px] font-semibold text-white">
              {member.name
                .split(" ")
                .map((part) => part[0])
                .join("")}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-ink-900">
                {member.name}
              </span>
              <span className="block truncate text-[11.5px] text-ink-400">
                {member.email}
              </span>
            </span>

            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                member.role === "Owner"
                  ? "bg-brand-500 text-white"
                  : member.role === "Admin"
                    ? "bg-brand-50 text-brand-700"
                    : "bg-slate-100 text-ink-500"
              }`}
            >
              {member.role}
            </span>
          </li>
        ))}
      </ul>

      <p className="border-t border-line px-5 py-3 text-[11.5px] text-ink-400">
        Change someone's access whenever you need to.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function Features() {
  return (
    <div className="min-h-screen bg-white text-ink-900">
      <Navbar />

      {/* Hero */}
      <section className="relative isolate overflow-hidden border-b border-line">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-50 via-white to-white" />

          <div className="absolute -top-32 left-1/2 h-96 w-[46rem] -translate-x-1/2 rounded-full bg-brand-300/25 blur-[120px]" />

          <div className="margo-dot-grid absolute inset-0 opacity-60" />
        </div>

        <div className="mx-auto max-w-6xl px-5 pt-32 pb-16 sm:px-8 sm:pt-40 sm:pb-20 lg:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200/80 bg-white/80 px-3.5 py-1.5 text-[11px] font-medium text-ink-600 shadow-sm backdrop-blur-xl">
              <LuSparkles
                className="h-3.5 w-3.5 text-brand-500"
                aria-hidden="true"
              />
              Features
            </span>

            <h1 className="mx-auto mt-6 max-w-3xl text-[38px] leading-[1.05] font-semibold tracking-[-0.045em] text-ink-900 sm:text-[52px] lg:text-[60px]">
              A helpful answer, right where your visitors are
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-7 text-ink-500 sm:text-[17px] sm:leading-8">
              Margo learns from the content you already have — your website,
              documents and FAQs — then answers questions in a friendly chat on
              your site. No scripts to write, no new tools to learn.
            </p>

            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Link to="/signup" className={PRIMARY_BUTTON}>
                Get Started Free
                <LuArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>

              <Link to="/how-it-works" className={SECONDARY_BUTTON}>
                See how it works
                <LuArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12.5px] text-ink-500">
              {TRUST_POINTS.map((point) => (
                <li key={point} className="inline-flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-50">
                    <LuCheck
                      className="h-2.5 w-2.5 text-brand-500"
                      aria-hidden="true"
                    />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
        <SectionIntro
          eyebrow="What you get"
          title="The useful things, done properly"
          description="Margo handles the whole loop: learn your content, answer your visitors, and show you what happened. Here's what that looks like in practice."
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </section>

      {/* Deep dives */}
      <section className="border-y border-line bg-slate-50/60">
        <div className="mx-auto max-w-6xl space-y-20 px-5 py-16 sm:px-8 sm:py-20 lg:space-y-24 lg:px-10">
          <DeepDive
            eyebrow="Knowledge"
            title="Teach it once. It remembers."
            description="Point Margo at your website or upload the documents you already share with customers. Everything lives in one knowledge base, and Margo draws on it whenever someone asks a question."
            points={[
              "Crawl your website and follow the progress",
              "Upload PDFs, guides and FAQs",
              "Remove a source and Margo stops using it",
            ]}
            visual={<KnowledgeMock />}
          />

          <DeepDive
            reverse
            eyebrow="Conversations"
            title="Answers that sound like your business"
            description="Margo greets visitors in your words and replies in the tone you choose. Answers come from your own content, so the details are yours — not a generic AI guess."
            points={[
              "Friendly, professional, playful or concise",
              "A greeting you control, word for word",
              "Replies drawn from your own sources",
            ]}
            visual={<ChatMock />}
          />

          <DeepDive
            eyebrow="Insights"
            title="See what people actually ask"
            description="Every conversation lands in your dashboard with its full transcript. Read what visitors wanted, spot the questions you keep answering, and improve the content that powers Margo."
            points={[
              "Every chat saved, start to finish",
              "Scan recent conversations at a glance",
              "Turn real questions into better content",
            ]}
            visual={<ConversationsMock />}
          />
        </div>
      </section>

      {/* Team */}
      <section className="border-b border-line bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-10">
          <div>
            <Eyebrow>Team</Eyebrow>

            <h2 className="mt-3 text-[28px] font-semibold tracking-tight text-ink-900 sm:text-[34px]">
              Built for teams, not just one person
            </h2>

            <p className="mt-3 max-w-xl text-[14.5px] leading-7 text-ink-500">
              Invite the people who know your business best, then give each of
              them the access they need. Owners manage everything; admins and
              members see exactly what they should.
            </p>

            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {TEAM_POINTS.map((point) => (
                <li key={point}>
                  <CheckLine>{point}</CheckLine>
                </li>
              ))}
            </ul>
          </div>

          <TeamMock />
        </div>
      </section>

      {/* Plans */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
          <div className="grid gap-8 p-7 sm:p-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-14">
            <div>
              <Eyebrow>Pricing</Eyebrow>

              <h2 className="mt-3 text-[28px] font-semibold tracking-tight text-ink-900 sm:text-[34px]">
                Simple plans, honest limits
              </h2>

              <p className="mt-3 max-w-xl text-[14px] leading-7 text-ink-500">
                Start with a 14-day trial. Plans scale by team seats, documents,
                crawled pages, monthly messages and widget domains — so you only
                pay for what you actually use.
              </p>
            </div>

            <div>
              <ul className="space-y-2.5 rounded-2xl border border-line bg-slate-50/70 p-5">
                {[
                  "14-day trial on every new workspace",
                  "No credit card to get started",
                  "Upgrade, downgrade or cancel anytime",
                ].map((point) => (
                  <li key={point}>
                    <CheckLine>{point}</CheckLine>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap gap-2.5">
                <Link to="/pricing" className={PRIMARY_BUTTON}>
                  Compare plans
                  <LuArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>

                <Link to="/signup" className={SECONDARY_BUTTON}>
                  Start free
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="px-5 pb-20 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 px-6 py-14 text-center shadow-[0_35px_90px_-40px_rgba(4,51,47,0.7)] sm:px-10 sm:py-16">
          <h2 className="mx-auto max-w-2xl text-[30px] font-semibold tracking-tight text-white sm:text-[38px]">
            Give your visitors a better answer
          </h2>

          <p className="mx-auto mt-4 max-w-xl text-[14.5px] leading-7 text-white/75">
            Set Margo up in a few minutes. You can change the content, the
            colors and even the plan later — nothing is permanent.
          </p>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link
              to="/signup"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[13.5px] font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Get Started Free
              <LuArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>

            <Link
              to="/how-it-works"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/30 px-5 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              See how it works
              <LuArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
