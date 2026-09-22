import type { ReactNode } from "react";

import { LockIcon, SparklesIcon } from "./Icons";
import { MargoLogo } from "./MargoLogo";

type AuthLayoutProps = {
  /** Card contents — the screen's heading, form and links. */
  children: ReactNode;
  /** Small print shown under the card. */
  footer?: ReactNode;
};

/**
 * Shared shell for every auth screen: marketing panel on the left,
 * centred card on the right, stacked and condensed on small screens.
 */
export function AuthLayout({ children, footer }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-white lg:grid lg:h-screen lg:grid-cols-[1.05fr_minmax(0,1fr)] lg:overflow-hidden">
      <aside className="margo-dot-grid relative hidden flex-col overflow-y-auto border-r border-line bg-brand-50/60 px-10 py-12 lg:flex lg:min-h-0 xl:px-16 xl:py-14">
        <MargoLogo />

        <div className="mt-12 max-w-xl xl:mt-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white px-3 py-1.5 text-[12px] font-medium text-brand-700">
            <SparklesIcon className="h-3.5 w-3.5" />
            AI chatbot for your website
          </span>

          <h2 className="mt-6 text-[34px] leading-[1.15] font-semibold tracking-tight text-ink-900 xl:text-[42px]">
            Bring an AI assistant to your website.
          </h2>

          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-ink-500 xl:text-base">
            Margo lets your company teach a chatbot using your own website pages
            and uploaded documents, so every visitor gets accurate, on-brand
            answers in seconds — without engineering work on your side.
          </p>
        </div>

        <div className="mt-auto flex items-start gap-2.5 border-t border-line pt-6 text-[13px] text-ink-500">
          <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
          Enterprise-grade security. Your content is never used to train public
          models.
        </div>
      </aside>

      <main className="flex min-h-screen px-5 py-12 sm:px-8 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:py-16">
        <div className="m-auto w-full max-w-md">
          {/* Condensed brand header for small screens */}
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
            <MargoLogo size="lg" />
            <p className="text-[15px] text-ink-500">
              Bring an AI assistant to your website.
            </p>
          </div>

          <section className="rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
            {children}
          </section>

          {footer ? (
            <p className="mt-6 flex items-center justify-center gap-2 text-center text-[12px] text-ink-400">
              {footer}
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
