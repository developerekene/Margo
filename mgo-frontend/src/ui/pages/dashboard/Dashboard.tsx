import { useEffect, useState } from "react";
import type { ComponentType } from "react";

import {
  LuBell,
  LuBookOpen,
  LuBot,
  LuCreditCard,
  LuMessageSquare,
} from "react-icons/lu";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate, useParams } from "react-router-dom";

import { logout } from "../../../Redux/Slices/authslic";
import type { RootState } from "../../../Redux/Store";
import { Agent } from "../../Components/dashboard/Agent";
import { Billing } from "../../Components/dashboard/Billing";
import { Conversations } from "../../Components/dashboard/Conversations";
import { Knowledge } from "../../Components/dashboard/Knowledge";
import { DashboardNavbar } from "../../Components/dashboard/Navbar";
import { Sidebar } from "../../Components/dashboard/Sidebar";
import { Team } from "../../Components/dashboard/Team";
import { Widget } from "../../Components/dashboard/Widget";

/** Sidebar section id -> header label. */
const SECTIONS: Record<string, string> = {
  overview: "Overview",
  agent: "Agent",
  knowledge: "Knowledge",
  widget: "Widget",
  conversations: "Conversations",
  team: "Team",
  billing: "Billing",
};

/** Page copy for every section except the overview header. */
const HEADINGS: Record<string, { title: string; description: string }> = {
  agent: {
    title: "Customize your assistant",
    description:
      "Choose how Margo introduces itself, sounds, and looks on your website.",
  },
  knowledge: {
    title: "Teach Margo about your business",
    description:
      "Add your website or upload documents for your assistant to learn from.",
  },
  widget: {
    title: "Add Margo to your website",
    description:
      "Copy your embed code and approve the domains your widget runs on.",
  },
  conversations: {
    title: "Conversations",
    description: "Every chat visitors have had with your assistant.",
  },
  team: {
    title: "Team",
    description: "Invite teammates and manage who can access this workspace.",
  },
  billing: {
    title: "Billing",
    description: "Review your plan, usage, and subscription details.",
  },
};

/** Which body to render for each `/dashboard/:section` route. */
const SECTION_BODIES: Record<string, ComponentType> = {
  agent: Agent,
  knowledge: Knowledge,
  widget: Widget,
  conversations: Conversations,
  team: Team,
  billing: Billing,
};

const STAT_CARDS = [
  {
    label: "Subscription",
    value: "Free Trial",
    hint: "14 days remaining",
    icon: LuCreditCard,
  },
  {
    label: "Knowledge sources",
    value: "0",
    hint: "Documents & website data",
    icon: LuBookOpen,
  },
  {
    label: "Conversations",
    value: "0",
    hint: "This month",
    icon: LuMessageSquare,
  },
  {
    label: "Assistant status",
    value: "Not live",
    hint: "Complete setup to launch",
    icon: LuBot,
  },
];

/** "Amina Bello" -> "AB" — falls back to the first two characters. */
function getInitials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || name.slice(0, 2).toUpperCase()
  );
}

/** Workspace at a glance. */
function OverviewStats() {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {STAT_CARDS.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-line bg-white p-4 shadow-soft"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium tracking-[0.06em] text-ink-400 uppercase">
              {card.label}
            </p>
            <card.icon
              className="h-4 w-4 shrink-0 text-ink-400"
              aria-hidden="true"
            />
          </div>
          <p className="mt-2.5 text-[20px] font-semibold tracking-tight text-ink-900">
            {card.value}
          </p>
          <p className="mt-1 text-[12px] text-ink-400">{card.hint}</p>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { section } = useParams();
  const [navOpen, setNavOpen] = useState(false);

  const user = useSelector((state: RootState) => state.auth.user);
  const isAuthenticated = useSelector(
    (state: RootState) => state.auth.isAuthenticated,
  );

  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate("/signin");
    }
  }, [isAuthenticated, user, navigate]);

  if (!user) return null;

  const initials = getInitials(user.adminName);
  const currentSection = SECTIONS[section ?? "overview"] ?? "Overview";
  const isOverview = !section || section === "overview";
  const page = HEADINGS[section ?? ""];
  const Body = section ? SECTION_BODIES[section] : undefined;
  const heading = isOverview
    ? `Welcome back, ${user.adminName}`
    : (page?.title ?? currentSection);
  const description = isOverview
    ? "Your Margo workspace is ready. Let's get your AI assistant ready for your website."
    : page?.description;

  function signOut() {
    dispatch(logout());
    navigate("/signin");
  }

  return (
    <div className="min-h-screen bg-slate-50/70">
      <Sidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        companyName={user.companyName}
        adminName={user.adminName}
        email={user.email}
        initials={initials}
        onSignOut={signOut}
      />

      {/* Offset by the sidebar width (268px) once the sidebar is pinned on desktop. */}
      <div className="lg:pl-[268px]">
        <DashboardNavbar
          onOpenSidebar={() => setNavOpen(true)}
          userName={user.adminName}
          initials={initials}
        />

        <main className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-5xl">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium tracking-[0.08em] text-brand-600 uppercase">
                  {currentSection}
                </p>
                <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink-900 sm:text-[26px]">
                  {heading}
                </h1>
                {description ? (
                  <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-500">
                    {description}
                  </p>
                ) : null}
              </div>

              <div className="hidden items-center gap-2 lg:flex">
                <button
                  type="button"
                  aria-label="Notifications"
                  className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-ink-500 transition-colors hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  <LuBell className="h-4.5 w-4.5" aria-hidden="true" />
                  <span
                    className="absolute top-2 right-2.5 h-1.5 w-1.5 rounded-full bg-brand-500"
                    aria-hidden="true"
                  />
                </button>

                <Link
                  to="/chatbot"
                  className="rounded-lg bg-brand-500 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  View assistant
                </Link>

                <span
                  title={user.adminName}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-[12.5px] font-semibold text-white"
                >
                  {initials}
                </span>
              </div>
            </header>

            {isOverview ? <OverviewStats /> : null}

            {Body ? (
              <div className="mt-8">
                <Body />
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
