import {
  LuArrowRight,
  LuBot,
  LuCheck,
  LuMail,
  LuMessageCircle,
} from "react-icons/lu";
import { Navbar } from "../Components/Navbar";
import { Footer } from "../Components/Footer";

export default function ContactUs() {
  return (
    <div className="min-h-screen bg-slate-50/70">
      <Navbar />
      <main className=" px-4 py-28 sm:px-6 lg:px-10">
        <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-3xl border border-brand-100 lg:grid-cols-2">
          {/* Left side */}
          <section className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-white to-white px-7 py-12 sm:px-10 lg:px-12">
            {/* Abstract background */}
            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#0a756c]/20 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-[#0a756c]/10 blur-3xl" />

            <div className="relative z-10 flex h-full flex-col">
              {/* Logo */}
              <div className="flex items-center gap-2 text-[#0a756c]">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0a756c] text-white">
                  <LuBot size={21} />
                </div>

                <span className="text-xl font-bold">Margo</span>
              </div>

              <div className="my-auto max-w-md py-16">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-[#0a756c]">
                  <LuMessageCircle size={14} />
                  Let's talk
                </span>

                <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
                  Get in touch
                  <br />
                  with the Margo team.
                </h1>

                <p className="mt-6 max-w-md text-base leading-7 text-slate-600">
                  Have questions about Margo, need help getting started, or want
                  to learn how an AI assistant can work for your business? We'd
                  love to hear from you.
                </p>

                {/* Highlights */}
                <div className="mt-8 space-y-4">
                  {[
                    "Questions about getting started",
                    "Help setting up your AI agent",
                    "Business and partnership enquiries",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0a756c] text-white">
                        <LuCheck size={14} />
                      </span>

                      <span className="text-sm text-slate-700">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-sm text-slate-500">
                <p>Have something to share?</p>
                <div className="mt-2 flex items-center gap-2 font-medium text-[#0a756c]">
                  <LuMail size={16} />
                  Send us a message
                </div>
              </div>
            </div>
          </section>

          {/* Right side */}
          <section className="bg-[#202020] px-6 py-10 text-white sm:px-10 lg:px-12">
            <div className="mx-auto flex h-full max-w-xl flex-col justify-center">
              <div className="mb-8">
                <p className="text-sm font-medium text-[#ffeacf]">Contact us</p>

                <h2 className="mt-2 text-3xl font-bold sm:text-4xl">
                  How can we help?
                </h2>

                <p className="mt-3 text-sm leading-6 text-white/60">
                  Fill out the form and tell us what you need. We'll get back to
                  you as soon as possible.
                </p>
              </div>

              <form className="space-y-5">
                {/* Names */}
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-white/80">
                      First name<span className="text-[#ffeacf]">*</span>
                    </label>

                    <input
                      type="text"
                      required
                      placeholder="First name"
                      className="mt-2 w-full rounded-lg border border-white/10 bg-[#111827] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#0a756c] focus:ring-2 focus:ring-[#0a756c]/20"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-white/80">
                      Last name<span className="text-[#ffeacf]">*</span>
                    </label>

                    <input
                      type="text"
                      required
                      placeholder="Last name"
                      className="mt-2 w-full rounded-lg border border-white/10 bg-[#111827] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#0a756c] focus:ring-2 focus:ring-[#0a756c]/20"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="text-sm font-medium text-white/80">
                    Work email<span className="text-[#ffeacf]">*</span>
                  </label>

                  <input
                    type="email"
                    required
                    placeholder="you@company.com"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-[#111827] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#0a756c] focus:ring-2 focus:ring-[#0a756c]/20"
                  />
                </div>

                {/* Company */}
                <div>
                  <label className="text-sm font-medium text-white/80">
                    Company
                  </label>

                  <input
                    type="text"
                    placeholder="Company name"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-[#111827] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#0a756c] focus:ring-2 focus:ring-[#0a756c]/20"
                  />
                </div>

                {/* Subject */}
                <div>
                  <label className="text-sm font-medium text-white/80">
                    What can we help with?
                  </label>

                  <select
                    defaultValue=""
                    className="mt-2 w-full rounded-lg border border-white/10 bg-[#111827] px-4 py-3 text-sm text-white outline-none focus:border-[#0a756c] focus:ring-2 focus:ring-[#0a756c]/20"
                  >
                    <option value="" disabled>
                      Select an option
                    </option>
                    <option>Getting started</option>
                    <option>AI agent setup</option>
                    <option>Technical support</option>
                    <option>Business enquiry</option>
                    <option>Other</option>
                  </select>
                </div>

                {/* Message */}
                <div>
                  <label className="text-sm font-medium text-white/80">
                    Message<span className="text-[#ffeacf]">*</span>
                  </label>

                  <textarea
                    required
                    rows={5}
                    placeholder="Tell us a little about what you need..."
                    className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-[#111827] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#0a756c] focus:ring-2 focus:ring-[#0a756c]/20"
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  className="group flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a756c] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#085f58]"
                >
                  Send message
                  <LuArrowRight
                    size={17}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </button>

                <p className="text-center text-xs leading-5 text-white/40">
                  By submitting this form, you agree that Margo may use the
                  information you provide to respond to your enquiry.
                </p>
              </form>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
