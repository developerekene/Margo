import { LuArrowRight, LuSparkles } from "react-icons/lu";
import { Link } from "react-router-dom";

import { Footer } from "../Components/Footer";
import { Navbar } from "../Components/Navbar";

const STEPS = [
  {
    title: "Teach Margo",
    text: "Add your website or upload your business documents.",
  },
  {
    title: "Customize",
    text: "Set your chatbot's name, greeting, and personality.",
  },
  {
    title: "Add to your website",
    text: "Copy the embed code and let your visitors chat with your AI assistant.",
  },
];

/** Decorative product shot — an AI chatbot / business knowledge dashboard. */

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden px-5 pt-32 pb-20 sm:px-8 sm:pt-40">
        {/* Abstract background */}
        <img
          src="/margo_hero_background.svg"
          alt=""
          aria-hidden="true"
          decoding="async"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover select-none"
        />

        <div className="relative mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-3.5 py-1.5 text-[12.5px] font-medium text-ink-500 backdrop-blur-md">
            <LuSparkles className="h-3.5 w-3.5 text-brand-500" />
            New · Train Margo on your own documents
          </span>

          <h1 className="mt-7 text-[42px] leading-[1.04] font-semibold tracking-[-0.03em] text-ink-900 sm:text-[58px] lg:text-[66px]">
            Turn your website into an{" "}
            <span className="text-brand-500">AI-powered experience</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-ink-500 sm:text-[17px]">
            Teach an AI chatbot using your website or uploaded documents, then
            add it to your own site in minutes — so every visitor gets accurate
            answers instantly.
          </p>

          <div className="mt-9 flex justify-center">
            <Link
              to="/signup"
              className="group inline-flex items-center gap-2 rounded-full bg-brand-500 px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_16px_40px_-16px_rgba(10,117,108,0.75)] transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              Get Started
              <LuArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="about" className="border-y border-line bg-slate-50">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <h2 className="text-center text-[28px] font-semibold tracking-tight text-ink-900">
            How it works
          </h2>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                className="rounded-xl border border-line bg-white p-6"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-[13px] font-semibold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-[15px] font-semibold text-ink-900">
                  {step.title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="pricing" className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <div className="text-center">
          <h2 className="text-[28px] leading-tight font-semibold tracking-tight text-ink-900">
            Ready to give your website an AI assistant?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-ink-500">
            Start free, train Margo on your own content, and embed your
            assistant today. No credit card required.
          </p>
          <Link
            to="/signup"
            className="mt-8 inline-block rounded-lg bg-brand-500 px-6 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Get Started
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
