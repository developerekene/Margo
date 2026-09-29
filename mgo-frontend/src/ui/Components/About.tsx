import {
  LuBrain,
  LuGlobe,
  LuMessageCircle,
  LuShieldCheck,
  LuSparkles,
} from "react-icons/lu";

const features = [
  {
    icon: LuBrain,
    title: "Teach your AI",
    text: "Give Margo knowledge about your business through your website, PDFs, or Markdown files.",
  },
  {
    icon: LuMessageCircle,
    title: "Help your visitors",
    text: "Let visitors ask questions and receive answers based on your business knowledge.",
  },
  {
    icon: LuGlobe,
    title: "Works on your website",
    text: "Add Margo to your website using a simple embed snippet.",
  },
  {
    icon: LuShieldCheck,
    title: "Built for your business",
    text: "Manage your agent, knowledge, team, conversations, and widget from one dashboard.",
  },
];

export default function AboutUs() {
  return (
    <main>
      {/* Hero */}
      <section id="about" className=" px-5 py-12 sm:px-8 lg:px-16">
        <div className="mx-auto max-w-6xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">
            About Margo
          </span>

          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            AI support that understands your business.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600">
            Margo helps businesses create an AI chatbot that learns from their
            own business information and helps website visitors get answers.
          </p>
        </div>
      </section>

      {/* What we do */}
      <section className="px-2 py-20 sm:px-4 lg:px-12">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="font-semibold text-[#0a756c]">What Margo does</p>

            <h2 className="mt-3 text-3xl font-bold text-slate-900">
              Turn your business knowledge into helpful conversations.
            </h2>

            <p className="mt-5 leading-7 text-slate-600">
              Connect your website or upload your business documents. Margo uses
              that information to power an AI agent that can answer questions
              from visitors on your website.
            </p>

            <p className="mt-4 leading-7 text-slate-600">
              You can manage your agent, knowledge, widget, team, billing and
              conversations from one dashboard.
            </p>
          </div>

          {/* Visual */}
          <div className="rounded-3xl bg-[#0a756c] p-8 shadow-xl sm:p-10">
            <div className="rounded-2xl bg-white p-6">
              <LuSparkles className="text-[#0a756c]" size={42} />

              <h3 className="mt-6 text-xl font-bold text-slate-900">
                Your business knowledge
              </h3>

              <div className="my-5 h-px bg-slate-200" />

              <div className="space-y-3 text-sm text-slate-600">
                <p>✓ Website content</p>
                <p>✓ PDF documents</p>
                <p>✓ Markdown documents</p>
                <p>✓ AI-powered visitor conversations</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-slate-50 px-5 py-20 sm:px-8 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="font-semibold text-[#0a756c]">Why Margo</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">
              Everything you need to power your AI assistant.
            </h2>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[0_20px_50px_-25px_rgba(15,23,42,0.3)]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                  <Icon size={22} />
                </div>

                <h3 className="mt-5 font-semibold text-slate-900">{title}</h3>

                <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
