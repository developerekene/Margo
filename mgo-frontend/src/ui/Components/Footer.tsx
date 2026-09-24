import { Link } from "react-router-dom";

import { MargoLogo } from "./MargoLogo";

type FooterLink = {
  label: string;
  /** In-page section anchor. */
  href?: string;
  /** Router path. */
  to?: string;
};

const LINKS: FooterLink[] = [
  { label: "Features", href: "/#features" },
  { label: "How It Works", href: "/#how" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Sign In", to: "/signin" },
  { label: "Get Started", to: "/signup" },
];

/** Site footer — branding, navigation and copyright. */
export function Footer() {
  return (
    <footer className="border-t border-line bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div>
          <MargoLogo />
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-ink-500">
            Add an AI assistant to your website, trained on your own content.
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {LINKS.map((link) => (
              <li key={link.label}>
                {link.to ? (
                  <Link
                    to={link.to}
                    className="text-[13px] text-ink-500 transition-colors hover:text-brand-600"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    href={link.href}
                    className="text-[13px] text-ink-500 transition-colors hover:text-brand-600"
                  >
                    {link.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-5 py-5 text-[12px] text-ink-400 sm:px-8">
          © {new Date().getFullYear()} Margo. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
