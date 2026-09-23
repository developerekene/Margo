import { useState } from "react";
import { LuMenu, LuX } from "react-icons/lu";
import { Link } from "react-router-dom";

import { MargoLogo } from "./MargoLogo";

const LINKS = [
  { label: "About Us", href: "/#about" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Blog", href: "/#blog" },
];

/** Floating pill navigation — glass bar on desktop, sheet on mobile. */
export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed inset-x-0 top-3 z-50 px-4 sm:top-4 sm:px-6">
      <nav className="mx-auto flex max-w-4xl items-center justify-between gap-3 rounded-full border border-line/80 bg-white/75 py-2.5 pr-2.5 pl-5 shadow-[0_12px_40px_-18px_rgba(16,24,40,0.3)] backdrop-blur-xl">
        <Link to="/" aria-label="Margo home">
          <MargoLogo />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                className="rounded-full px-3.5 py-2 text-[13.5px] text-ink-500 transition-colors hover:bg-slate-100/80 hover:text-ink-900"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link
            to="/signup"
            className="hidden rounded-full bg-ink-900 px-4.5 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:inline-block"
          >
            Get Started
          </Link>

          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-700 transition-colors hover:bg-slate-50 md:hidden"
          >
            {open ? (
              <LuX className="h-4.5 w-4.5" />
            ) : (
              <LuMenu className="h-4.5 w-4.5" />
            )}
          </button>
        </div>
      </nav>

      {open ? (
        <div
          id="mobile-menu"
          className="mx-auto mt-2 max-w-4xl rounded-2xl border border-line bg-white/95 p-3 shadow-lg backdrop-blur-xl md:hidden"
        >
          <ul className="space-y-1">
            {LINKS.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-3 py-2.5 text-[14px] text-ink-700 transition-colors hover:bg-slate-100/80 hover:text-ink-900"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <Link
            to="/signup"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-xl bg-ink-900 px-4 py-2.5 text-center text-[14px] font-semibold text-white"
          >
            Get Started
          </Link>
        </div>
      ) : null}
    </div>
  );
}
