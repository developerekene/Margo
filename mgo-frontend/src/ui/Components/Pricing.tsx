import { useState } from "react";

import { LuArrowRight, LuCheck, LuMinus, LuSparkles } from "react-icons/lu";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";

import type {
  BillingCycle,
  BillingPlan,
} from "../../Redux/Slices/billingslic";
import type { RootState } from "../../Redux/Store";
import { formatCount, formatMoney } from "./dashboard/billingFormat";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

const CYCLE_OPTIONS: { id: BillingCycle; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "annual", label: "Annual" },
];

const TRUST_POINTS = [
  "No credit card required",
  "14-day trial",
  "Cancel anytime",
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatPrice(value: number, currency: string) {
  return formatMoney(value, currency, true);
}

/** Monthly price for the selected cycle, with the discount applied to annual. */
function priceForCycle(
  plan: BillingPlan,
  cycle: BillingCycle,
  discount: number,
) {
  if (cycle === "monthly") return plan.price;

  return plan.price * (1 - discount / 100);
}

/* -------------------------------------------------------------------------- */
/* Plan card                                                                  */
/* -------------------------------------------------------------------------- */

function PlanCard({
  plan,
  cycle,
  discount,
  currency,
  featureKeys,
}: {
  plan: BillingPlan;
  cycle: BillingCycle;
  discount: number;
  currency: string;
  featureKeys: string[];
}) {
  const price = priceForCycle(plan, cycle, discount);
  const annualTotal = plan.price * 12 * (1 - discount / 100);
  const isFree = plan.price === 0;

  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-soft transition-all duration-200 hover:-translate-y-1 ${
        plan.popular
          ? "border-brand-500 ring-1 ring-brand-500"
          : "border-line hover:border-brand-200"
      }`}
    >
      {plan.popular ? (
        <span className="absolute top-4 right-4 rounded-full bg-brand-500 px-2.5 py-1 text-[10px] font-semibold text-white">
          Most popular
        </span>
      ) : null}

      <div
        className={`border-b border-line p-5 ${
          plan.popular ? "bg-[#ffeacf]/60" : "bg-slate-50/70"
        }`}
      >
        <h2 className="text-[14px] font-semibold text-ink-900">{plan.name}</h2>

        <div className="mt-3 flex items-end gap-1">
          <span className="text-[30px] leading-none font-bold text-ink-900">
            {formatPrice(price, currency)}
          </span>
          <span className="mb-0.5 text-[11.5px] text-ink-500">
            /agent/month
          </span>
        </div>

        {cycle === "annual" && !isFree ? (
          <p className="mt-1.5 text-[11px] font-medium text-brand-700">
            Billed {formatPrice(annualTotal, currency)}/agent per year
          </p>
        ) : null}

        <p className="mt-2 text-[12px] leading-relaxed text-ink-500">
          {plan.description}
        </p>
      </div>

      <div className="flex-1 p-5">
        <div className="space-y-2.5">
          {/* Conversations come from the plan limits, never from the feature text. */}
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="min-w-0 text-ink-500">Conversations</span>
            <span className="shrink-0 text-right text-ink-700">
              {plan.limits.conversations === null
                ? "Unlimited"
                : `${formatCount(plan.limits.conversations)} /month`}
            </span>
          </div>

          {featureKeys.map((feature) => {
            const value = plan.features[feature];

            return (
              <div
                key={feature}
                className="flex items-center justify-between gap-2 text-[12px]"
              >
                <span className="min-w-0 text-ink-500">{feature}</span>

                {value === true ? (
                  <LuCheck
                    className="h-3.5 w-3.5 shrink-0 text-brand-500"
                    aria-label="Included"
                  />
                ) : value === false || value === undefined ? (
                  <LuMinus
                    className="h-3.5 w-3.5 shrink-0 text-slate-300"
                    aria-label="Not included"
                  />
                ) : (
                  <span className="shrink-0 text-right text-ink-700">
                    {value}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-line p-5">
        <Link
          to={`/signup?plan=${plan.id}`}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          {isFree ? "Get started free" : `Buy ${plan.name}`}
          <LuArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Public pricing — reads the same `billing` slice as the dashboard, so plan
 * names, prices, currency, annual discount, limits and feature rows edited by
 * an admin appear here immediately.
 */
export default function Pricing() {
  const settings = useSelector((state: RootState) => state.billing);

  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  const discount = settings.annualDiscountPercent;

  return (
    <div className="min-h-screen bg-white text-ink-900">
      <Navbar />

      {/* Hero */}
      <section className="relative isolate overflow-hidden border-b border-line">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-50 via-white to-white" />

          <div className="absolute -top-32 left-1/2 h-96 w-[46rem] -translate-x-1/2 rounded-full bg-brand-300/25 blur-[120px]" />

          <div className="margo-dot-grid absolute inset-0 opacity-60" />
        </div>

        <div className="mx-auto max-w-6xl px-5 pt-32 pb-14 sm:px-8 sm:pt-40 sm:pb-16 lg:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200/80 bg-white/80 px-3.5 py-1.5 text-[11px] font-medium text-ink-600 shadow-sm backdrop-blur-xl">
              <LuSparkles
                className="h-3.5 w-3.5 text-brand-500"
                aria-hidden="true"
              />
              Pricing
            </span>

            <h1 className="mx-auto mt-6 text-[38px] leading-[1.05] font-semibold tracking-[-0.045em] text-ink-900 sm:text-[50px]">
              Plans that grow with your website
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-[15px] leading-7 text-ink-500 sm:text-[16px]">
              Start free and upgrade when more visitors start asking. Every
              plan includes the same assistant, trained on your own content.
            </p>

            {/* Billing cycle */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <div
                role="group"
                aria-label="Billing cycle"
                className="inline-flex rounded-xl border border-line bg-white p-1 shadow-soft"
              >
                {CYCLE_OPTIONS.map((option) => {
                  const active = cycle === option.id;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCycle(option.id)}
                      className={`rounded-lg px-4 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                        active
                          ? "bg-brand-500 text-white"
                          : "text-ink-500 hover:text-ink-900"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {discount > 0 ? (
                <span className="rounded-full bg-[#ffeacf] px-2.5 py-1 text-[11px] font-semibold text-ink-900">
                  Save {discount}% annually
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
        {settings.plans.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {settings.plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                cycle={cycle}
                discount={discount}
                currency={settings.currency}
                featureKeys={settings.featureKeys}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-line bg-slate-50/70 px-5 py-10 text-center text-[13px] text-ink-500">
            Plans are being updated. Please check back shortly.
          </p>
        )}

        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-ink-400">
          Prices are per agent, per month in {settings.currency}. Annual billing
          is charged once a year at {discount}% off the monthly price; plan
          features stay the same.
        </p>

        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12.5px] text-ink-500">
          {TRUST_POINTS.map((point) => (
            <li key={point} className="inline-flex items-center gap-1.5">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-50">
                <LuCheck
                  className="h-2.5 w-2.5 text-brand-500"
                  aria-hidden="true"
                />
              </span>
              {point}
            </li>
          ))}
        </ul>
      </section>

      <Footer />
    </div>
  );
}
