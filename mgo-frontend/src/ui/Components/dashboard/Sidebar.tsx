import { useEffect } from "react";

import type { IconType } from "react-icons";
import {
  LuBookOpen,
  LuBot,
  LuCode,
  LuCreditCard,
  LuLayoutDashboard,
  LuLogOut,
  LuMessageSquare,
  LuSettings,
  LuUsers,
  LuX,
} from "react-icons/lu";
import { NavLink } from "react-router-dom";

import { MargoLogo } from "../MargoLogo";

type NavItem = {
  label: string;

  to: string;
  icon: IconType;
  /** Match the URL exactly (used for the index route). */
  end?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Workspace",
    items: [
      {
        label: "Overview",
        to: "/dashboard",
        icon: LuLayoutDashboard,
        end: true,
      },
      {
        label: "Agent",

        to: "/dashboard/agent",
        icon: LuBot,
      },
      {
        label: "Knowledge",

        to: "/dashboard/knowledge",
        icon: LuBookOpen,
      },
      {
        label: "Widget",

        to: "/dashboard/widget",
        icon: LuCode,
      },
    ],
  },
  {
    title: "Manage",
    items: [
      {
        label: "Conversations",

        to: "/dashboard/conversations",
        icon: LuMessageSquare,
      },
      {
        label: "Team",

        to: "/dashboard/team",
        icon: LuUsers,
      },
      {
        label: "Billing",

        to: "/dashboard/billing",
        icon: LuCreditCard,
      },
    ],
  },
];

type SidebarProps = {
  /** Mobile drawer state — the sidebar is always visible from `lg` up. */
  open: boolean;
  onClose: () => void;
  companyName: string;
  adminName: string;
  email: string;
  initials: string;
  onSignOut: () => void;
};

/**
 * Dashboard navigation. Sticky column on desktop, slide-out drawer on mobile.
 * Width (268px) is mirrored by the content offset in `Dashboard.tsx`.
 */
export function Sidebar({
  open,
  onClose,

  adminName,
  email,
  initials,
  onSignOut,
}: SidebarProps) {
  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!open) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — mobile drawer only. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-ink-900/25 transition-opacity duration-200 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        id="dashboard-sidebar"
        aria-label="Workspace navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col border-r border-line bg-white transition-transform duration-200 ease-out lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <NavLink
            to="/dashboard"
            onClick={onClose}
            aria-label="Margo dashboard"
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <MargoLogo size="sm" />
          </NavLink>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 lg:hidden"
          >
            <LuX className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-6 flex-1 space-y-6 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-2.5 text-[11px] font-medium tracking-[0.08em] text-ink-400 uppercase">
                {group.title}
              </p>

              <ul className="mt-2 space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.label}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `group flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition-colors ${
                          isActive
                            ? "bg-brand-500/10 text-brand-700"
                            : "text-ink-700 hover:bg-slate-100/80 hover:text-ink-900"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon
                            aria-hidden="true"
                            className={`mt-px h-4.5 w-4.5 shrink-0 ${
                              isActive
                                ? "text-brand-600"
                                : "text-ink-400 group-hover:text-ink-500"
                            }`}
                          />
                          <span className="min-w-0">
                            <span className="block text-[13.5px] font-medium">
                              {item.label}
                            </span>
                          </span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Account */}
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2.5 px-1.5 py-1.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[12.5px] font-semibold text-white">
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink-900">
                {adminName}
              </span>
              <span className="block truncate text-[11.5px] text-ink-400">
                {email}
              </span>
            </span>
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="rounded-full bg-[#ffeacf] px-2 py-0.5 text-[11px] font-medium text-brand-800">
              Owner
            </span>

            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="Workspace settings"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900"
              >
                <LuSettings className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Sign out"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900"
              >
                <LuLogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
