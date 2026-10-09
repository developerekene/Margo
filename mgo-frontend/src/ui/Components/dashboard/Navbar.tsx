import { LuBell, LuMenu } from "react-icons/lu";
import { Link } from "react-router-dom";

import { MargoLogo } from "../MargoLogo";

type DashboardNavbarProps = {
  onOpenSidebar: () => void;
  userName: string;
  initials: string;
};

/**
 * Compact top bar for the dashboard on small screens — on desktop the sidebar
 * carries the navigation and the page header carries the account controls.
 */
export function DashboardNavbar({
  onOpenSidebar,
  userName,
  initials,
}: DashboardNavbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur-xl lg:hidden">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-controls="dashboard-sidebar"
          aria-label="Open navigation"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <LuMenu className="h-4.5 w-4.5" aria-hidden="true" />
        </button>

        <Link
          to="/dashboard"
          aria-label="Margo dashboard"
          className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <MargoLogo size="sm" />
        </Link>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Notifications"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900"
          >
            <LuBell className="h-4.5 w-4.5" aria-hidden="true" />
            <span
              className="absolute top-2 right-2.5 h-1.5 w-1.5 rounded-full bg-brand-500"
              aria-hidden="true"
            />
          </button>

          <span
            title={userName}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[12.5px] font-semibold text-white"
          >
            {initials}
          </span>
        </div>
      </div>
    </header>
  );
}
