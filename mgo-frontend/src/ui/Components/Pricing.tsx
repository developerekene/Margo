import { LuCheck, LuMinus } from "react-icons/lu";
import { Link } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

const plans = [
  {
    name: "Hacker",
    price: 0,
    description: "Up to 2 agents",
    popular: false,
    features: {
      Conversations: "500 /month",
      Channels: "Live chat",
      Voice: false,
      "Captain AI": false,
      "Help center": false,
      Teams: false,
      "Automation rules": false,
      "SSO / SAML": false,
      "Audit logs": false,
      "Data retention": "30 days",
    },
  },
  {
    name: "Startups",
    price: 19,
    description: "Up to 2 agents",
    popular: false,
    features: {
      Conversations: "Unlimited",
      Channels: "All",
      Voice: false,
      "Captain AI": "300 credits",
      "Help center": true,
      Teams: false,
      "Automation rules": false,
      "SSO / SAML": false,
      "Audit logs": false,
      "Data retention": "1 year",
    },
  },
  {
    name: "Business",
    price: 39,
    description: "Up to 2 agents",
    popular: true,
    features: {
      Conversations: "Unlimited",
      Channels: "All",
      Voice: true,
      "Captain AI": "500 credits",
      "Help center": true,
      Teams: true,
      "Automation rules": true,
      "SSO / SAML": false,
      "Audit logs": false,
      "Data retention": "2 years",
    },
  },
  {
    name: "Enterprise",
    price: 99,
    description: "Up to 2 agents",
    popular: false,
    features: {
      Conversations: "Unlimited",
      Channels: "All",
      Voice: true,
      "Captain AI": "800 credits",
      "Help center": true,
      Teams: true,
      "Automation rules": true,
      "SSO / SAML": true,
      "Audit logs": true,
      "Data retention": "3 years",
    },
  },
];

const featureNames = Object.keys(plans[0].features);

export default function Pricing() {
  return (
    <section className="bg-white px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Navbar />
        {/* Heading */}
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            Flexible plans for growing teams
          </h2>

          <p className="mt-4 text-sm leading-6 text-slate-500 sm:text-base">
            Margo helps organizations manage their customer support workflows.
            Choose a plan that works best for your team.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col overflow-hidden rounded-xl border ${
                plan.popular
                  ? "border-[#0a756c] shadow-lg ring-1 ring-[#0a756c]"
                  : "border-slate-200"
              }`}
            >
              {plan.popular && (
                <span className="absolute right-3 top-3 rounded-full bg-[#0a756c] px-2.5 py-1 text-[10px] font-semibold text-white">
                  Most popular
                </span>
              )}

              {/* Card header */}
              <div
                className={`border-b p-5 ${
                  plan.popular ? "bg-[#ffeacf]/60" : "bg-slate-50"
                }`}
              >
                <h3 className="text-sm font-semibold text-slate-800">
                  {plan.name}
                </h3>

                <div className="mt-3 flex items-end gap-1">
                  <span className="text-3xl font-bold text-slate-900">
                    ${plan.price}
                  </span>
                  <span className="mb-1 text-xs text-slate-500">
                    /agent/month
                  </span>
                </div>

                <p className="mt-1 text-[11px] text-slate-500">
                  {plan.description}
                </p>
              </div>

              {/* Features */}
              <div className="flex-1 p-4">
                <div className="space-y-3">
                  {featureNames.map((feature) => {
                    const value =
                      plan.features[feature as keyof typeof plan.features];

                    return (
                      <div
                        key={feature}
                        className="flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="text-slate-500">{feature}</span>

                        {value === true ? (
                          <LuCheck size={14} className="text-[#0a756c]" />
                        ) : value === false ? (
                          <LuMinus size={14} className="text-slate-300" />
                        ) : (
                          <span className="text-right text-slate-700">
                            {value}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Button */}
              <div className="border-t p-4">
                <Link
                  to="/signup"
                  className={`w-full rounded-md px-4 py-2.5 text-xs font-semibold transition ${
                    plan.popular
                      ? "bg-[#0a756c] text-white hover:bg-[#085f58]"
                      : "bg-[#0a756c] text-white hover:bg-[#085f58]"
                  }`}
                >
                  {plan.price === 0 ? "Get started free" : `Buy ${plan.name}`}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </section>
  );
}
