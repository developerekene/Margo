import {
  LuArrowRight,
  LuCheck,
  LuFileText,
  LuGlobe,
  LuMessageCircle,
  LuSparkles,
  LuUpload,
} from "react-icons/lu";
import { Link } from "react-router-dom";

import { Footer } from "../Components/Footer";
import { Navbar } from "../Components/Navbar";

const STEPS = [
  {
    number: "01",
    icon: LuGlobe,
    title: "Connect your website",
    text: "Give Margo your website URL and let it learn from the content your customers already need.",
  },
  {
    number: "02",
    icon: LuFileText,
    title: "Teach Margo",
    text: "Upload PDFs, documents, FAQs, policies, or any other business knowledge.",
  },
  {
    number: "03",
    icon: LuMessageCircle,
    title: "Let customers chat",
    text: "Add Margo to your website and give every visitor instant, accurate answers.",
  },
];

const BENEFITS = [
  "Train on your own content",
  "Answers available 24/7",
  "Easy website integration",
];

export default function Home() {
  return (
    <div className="min-h-screen overflow-hidden bg-white text-ink-900">
      <Navbar />

      {/* =========================================================
          HERO
      ========================================================= */}
      <section className="relative isolate overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 -z-10">
          <img
            src="/margo_hero_background.svg"
            alt=""
            aria-hidden="true"
            decoding="async"
            className="h-full w-full object-cover opacity-80"
          />

          <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-white/65 to-white" />

          {/* Decorative glow */}
          <div className="absolute left-1/2 top-20 h-[320px] w-[320px] -translate-x-1/2 rounded-full bg-brand-400/15 blur-[100px] sm:h-[500px] sm:w-[500px]" />
        </div>

        <div className="mx-auto max-w-7xl px-5 pb-20 pt-24 sm:px-8 sm:pb-24 sm:pt-32 lg:px-10 lg:pb-28 lg:pt-36">
          <div className="mx-auto max-w-4xl text-center">
            {/* Badge */}
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-brand-200/80 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-ink-600 shadow-sm backdrop-blur-xl sm:px-4 sm:text-xs">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50">
                <LuSparkles className="h-3 w-3 text-brand-500" />
              </span>

              <span className="truncate">
                Train Margo on your own business knowledge
              </span>

              <LuArrowRight className="hidden h-3.5 w-3.5 text-brand-500 sm:block" />
            </div>

            {/* Heading */}
            <h1 className="mx-auto mt-6 max-w-4xl text-[42px] font-semibold leading-[1.02] tracking-[-0.045em] text-ink-950 sm:mt-8 sm:text-[56px] md:text-[64px] lg:text-[76px]">
              Turn your website into an{" "}
              <span className="relative inline-block text-brand-500">
                AI-powered
                <span className="absolute -bottom-1 left-0 h-2 w-full rounded-full bg-brand-200/70 sm:-bottom-2" />
              </span>{" "}
              experience
            </h1>

            {/* Description */}
            <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-7 text-ink-500 sm:mt-7 sm:text-[17px] sm:leading-8">
              Teach Margo using your website and business documents, then add
              an intelligent AI assistant to your site in minutes. Give every
              visitor fast, accurate answers — without adding more work to
              your team.
            </p>

            {/* CTA */}
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:mt-9 sm:flex-row sm:items-center">
              <Link
                to="/signup"
                className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-500 px-7 py-3.5 text-[14px] font-semibold text-white shadow-[0_18px_45px_-18px_rgba(10,117,108,0.75)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-600 hover:shadow-[0_22px_50px_-18px_rgba(10,117,108,0.8)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:min-h-11"
              >
                Get Started Free
                <LuArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>

              <a
                href="#how-it-works"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-white/80 px-6 py-3 text-[14px] font-semibold text-ink-700 backdrop-blur-sm transition-all hover:border-brand-200 hover:bg-white hover:text-brand-600 sm:min-h-11"
              >
                See how it works
              </a>
            </div>

            {/* Trust points */}
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-ink-500 sm:gap-x-6 sm:text-[13px]">
              {BENEFITS.map((benefit) => (
                <span
                  key={benefit}
                  className="inline-flex items-center gap-1.5"
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-50">
                    <LuCheck className="h-2.5 w-2.5 text-brand-500" />
                  </span>
                  {benefit}
                </span>
              ))}
            </div>
          </div>

          {/* =====================================================
              PRODUCT PREVIEW
          ===================================================== */}
          <div className="relative mx-auto mt-14 max-w-5xl sm:mt-16 lg:mt-20">
            {/* Glow */}
            <div className="absolute left-1/2 top-10 h-40 w-3/4 -translate-x-1/2 rounded-full bg-brand-400/20 blur-[80px]" />

            <div className="relative overflow-hidden rounded-2xl border border-line/80 bg-white/90 shadow-[0_35px_100px_-35px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:rounded-3xl">
              {/* Browser top */}
              <div className="flex h-10 items-center gap-2 border-b border-line bg-slate-50/90 px-4 sm:h-12 sm:px-5">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />

                <div className="mx-auto hidden h-6 max-w-xs flex-1 rounded-md border border-line bg-white sm:block" />
              </div>

              {/* Dashboard */}
              <div className="grid min-h-[300px] grid-cols-1 sm:min-h-[390px] md:grid-cols-[180px_1fr]">
                {/* Sidebar */}
                <div className="hidden border-r border-line bg-slate-50/70 p-4 md:block">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-white">
                      <LuSparkles className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-semibold">Margo</span>
                  </div>

                  <div className="mt-7 space-y-2">
                    {["Overview", "Knowledge", "Appearance", "Settings"].map(
                      (item, index) => (
                        <div
                          key={item}
                          className={`rounded-lg px-3 py-2 text-[11px] ${index === 0
                            ? "bg-white font-medium text-brand-600 shadow-sm"
                            : "text-ink-400"
                            }`}
                        >
                          {item}
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Main */}
                <div className="p-4 sm:p-6 lg:p-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-400">
                        AI assistant
                      </p>
                      <h3 className="mt-1 text-sm font-semibold sm:text-base">
                        Your Margo assistant
                      </h3>
                    </div>

                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-medium text-brand-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                      Active
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    {/* Knowledge card */}
                    <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
                          <LuUpload className="h-4 w-4 text-brand-500" />
                        </div>

                        <div>
                          <p className="text-xs font-semibold">
                            Knowledge base
                          </p>
                          <p className="mt-0.5 text-[10px] text-ink-400">
                            24 sources connected
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full w-[82%] rounded-full bg-brand-500" />
                      </div>

                      <div className="mt-2 flex justify-between text-[9px] text-ink-400">
                        <span>Training progress</span>
                        <span>82%</span>
                      </div>
                    </div>

                    {/* Conversations */}
                    <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                          <LuMessageCircle className="h-4 w-4 text-ink-600" />
                        </div>

                        <div>
                          <p className="text-xs font-semibold">
                            Conversations
                          </p>
                          <p className="mt-0.5 text-[10px] text-ink-400">
                            This month
                          </p>
                        </div>
                      </div>

                      <p className="mt-4 text-xl font-semibold tracking-tight">
                        1,284
                      </p>
                      <p className="mt-1 text-[9px] text-brand-600">
                        +18.4% from last month
                      </p>
                    </div>
                  </div>

                  {/* Chat preview */}
                  <div className="mt-4 rounded-xl border border-line bg-slate-50/70 p-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-white">
                        <LuSparkles className="h-3 w-3" />
                      </div>
                      <span className="text-[11px] font-semibold">
                        Margo AI
                      </span>
                    </div>

                    <div className="mt-3 max-w-[85%] rounded-xl rounded-tl-sm bg-white p-3 text-[10px] leading-relaxed text-ink-600 shadow-sm">
                      Hi! 👋 I’m Margo. I can answer questions about your
                      business, products, services, and documents.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          HOW IT WORKS
      ========================================================= */}
      <section
        id="how-it-works"
        className="border-y border-line bg-slate-50/70"
      >
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">
              Simple setup
            </span>

            <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[40px]">
              From your content to an AI assistant
            </h2>

            <p className="mt-4 text-sm leading-7 text-ink-500 sm:text-[15px]">
              No complicated AI setup. Give Margo your knowledge, customize
              the experience, and start helping your visitors.
            </p>
          </div>

          <div className="relative mt-12 grid gap-5 md:grid-cols-3 md:gap-6">
            {/* Connecting line */}
            <div className="absolute left-[16.66%] right-[16.66%] top-16 hidden h-px bg-line md:block" />

            {STEPS.map((step) => {
              const Icon = step.icon;

              return (
                <div
                  key={step.number}
                  className="group relative rounded-2xl border border-line bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[0_20px_50px_-25px_rgba(15,23,42,0.3)] sm:p-7"
                >
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                      <Icon className="h-5 w-5" />
                    </div>

                    <span className="text-xs font-semibold tracking-wider text-ink-300">
                      {step.number}
                    </span>
                  </div>

                  <h3 className="mt-6 text-base font-semibold text-ink-900">
                    {step.title}
                  </h3>

                  <p className="mt-2 text-[13.5px] leading-6 text-ink-500">
                    {step.text}
                  </p>

                  <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-brand-500 opacity-0 transition-opacity group-hover:opacity-100">
                    Learn more
                    <LuArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* =========================================================
          CTA
      ========================================================= */}
      <section className="relative overflow-hidden px-5 py-16 sm:px-8 sm:py-24 lg:py-28">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-400/10 blur-[100px]" />
        </div>

        <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-white px-6 py-12 text-center shadow-sm sm:px-12 sm:py-16">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-lg shadow-brand-500/20">
            <LuSparkles className="h-5 w-5" />
          </div>

          <h2 className="mx-auto mt-6 max-w-2xl text-[29px] font-semibold leading-tight tracking-[-0.035em] text-ink-950 sm:text-[40px]">
            Ready to give your website an AI assistant?
          </h2>

          <p className="mx-auto mt-4 max-w-xl text-[14px] leading-7 text-ink-500 sm:text-[15px]">
            Start free, train Margo on your own content, and give your
            visitors instant answers today. No credit card required.
          </p>

          <Link
            to="/signup"
            className="group mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-500 px-7 py-3.5 text-[14px] font-semibold text-white shadow-[0_16px_40px_-16px_rgba(10,117,108,0.7)] transition-all hover:-translate-y-0.5 hover:bg-brand-600 hover:shadow-[0_20px_45px_-16px_rgba(10,117,108,0.8)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Get Started Free
            <LuArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>

          <p className="mt-4 text-[11px] text-ink-400">
            Set up in minutes · No credit card required
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}