import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";

import { LuCheck, LuMinus, LuPencil, LuPlus, LuX } from "react-icons/lu";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";

import type { RootState } from "../../../Redux/Store";
import { PlanCheckout } from "./BillingCheckout";
import { BillingTransaction } from "./BillingTransaction";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type FeatureValue = string | boolean;

type BillingPlan = {
  id: string;
  name: string;
  /** Monthly price per agent. */
  price: number;
  description: string;
  popular: boolean;
  features: Record<string, FeatureValue>;
};

type BillingSettings = {
  /** Applied to the monthly price when annual billing is selected. */
  annualDiscountPercent: number;
  /** Row order for the comparison table; also the editable feature catalog. */
  featureKeys: string[];
  plans: BillingPlan[];
};

type BillingCycle = "monthly" | "annual";

/* -------------------------------------------------------------------------- */
/* Defaults                                                                   */
/* -------------------------------------------------------------------------- */

const DEFAULT_SETTINGS: BillingSettings = {
  annualDiscountPercent: 10,
  featureKeys: [
    "Conversations",
    "Channels",
    "Voice",
    "Captain AI",
    "Help center",
    "Teams",
    "Automation rules",
    "SSO / SAML",
    "Audit logs",
    "Data retention",
  ],
  plans: [
    {
      id: "starter",
      name: "Starter",
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
      id: "startups",
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
      id: "business",
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
      id: "enterprise",
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
  ],
};

/** Plans live in the browser until the billing API exists. */
const STORAGE_KEY = "margo:billing";

const CYCLE_OPTIONS: { id: BillingCycle; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "annual", label: "Annual" },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function isPlan(value: unknown): value is BillingPlan {
  if (!value || typeof value !== "object") return false;

  const plan = value as Partial<BillingPlan>;

  return (
    typeof plan.id === "string" &&
    typeof plan.name === "string" &&
    typeof plan.price === "number" &&
    typeof plan.description === "string" &&
    typeof plan.popular === "boolean" &&
    typeof plan.features === "object" &&
    plan.features !== null
  );
}

function isSettings(value: unknown): value is BillingSettings {
  if (!value || typeof value !== "object") return false;

  const settings = value as Partial<BillingSettings>;

  return (
    typeof settings.annualDiscountPercent === "number" &&
    Array.isArray(settings.featureKeys) &&
    settings.featureKeys.every((key) => typeof key === "string") &&
    Array.isArray(settings.plans) &&
    settings.plans.length > 0 &&
    settings.plans.every(isPlan)
  );
}

function loadSettings(): BillingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);

    const parsed: unknown = JSON.parse(raw);
    return isSettings(parsed) ? parsed : structuredClone(DEFAULT_SETTINGS);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function formatPrice(value: number) {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
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

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

const SECONDARY_BUTTON =
  "inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

const FIELD_INPUT =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink-900 caret-brand-500 outline-none transition-colors placeholder:text-ink-400 hover:border-line-strong focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10";

/* -------------------------------------------------------------------------- */
/* Plan card                                                                  */
/* -------------------------------------------------------------------------- */

function PlanCard({
  plan,
  cycle,
  discount,
  featureKeys,
  onBuy,
}: {
  plan: BillingPlan;
  cycle: BillingCycle;
  discount: number;
  featureKeys: string[];
  onBuy: (plan: BillingPlan) => void;
}) {
  const price = priceForCycle(plan, cycle, discount);
  const annualTotal = plan.price * 12 * (1 - discount / 100);
  const isFree = plan.price === 0;

  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-xl border bg-white shadow-soft ${
        plan.popular ? "border-brand-500 ring-1 ring-brand-500" : "border-line"
      }`}
    >
      {plan.popular ? (
        <span className="absolute top-3 right-3 rounded-full bg-brand-500 px-2.5 py-1 text-[10px] font-semibold text-white">
          Most popular
        </span>
      ) : null}

      <div
        className={`border-b border-line p-4 ${
          plan.popular ? "bg-[#ffeacf]/60" : "bg-slate-50/70"
        }`}
      >
        <h3 className="text-[13px] font-semibold text-ink-900">{plan.name}</h3>

        <div className="mt-2.5 flex items-end gap-1">
          <span className="text-[26px] leading-none font-bold text-ink-900">
            {formatPrice(price)}
          </span>
          <span className="mb-0.5 text-[11px] text-ink-500">/agent/month</span>
        </div>

        <p className="mt-1.5 text-[11.5px] text-ink-500">{plan.description}</p>

        {cycle === "annual" && !isFree ? (
          <p className="mt-1 text-[11px] text-brand-700">
            Billed {formatPrice(annualTotal)}/agent per year
          </p>
        ) : null}
      </div>

      <div className="flex-1 p-4">
        <div className="space-y-2.5">
          {featureKeys.map((feature) => {
            const value = plan.features[feature];

            return (
              <div
                key={feature}
                className="flex items-center justify-between gap-2 text-[11.5px]"
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

      <div className="border-t border-line p-4">
        {isFree ? (
          <Link to="/signup" className={`${PRIMARY_BUTTON} w-full`}>
            Get started free
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onBuy(plan)}
            className={`${PRIMARY_BUTTON} w-full`}
          >
            Buy {plan.name}
          </button>
        )}
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Admin editor                                                               */
/* -------------------------------------------------------------------------- */

function EditorField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-ink-700">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[11px] text-ink-400">{hint}</span>
      ) : null}
    </label>
  );
}

function BillingEditor({
  settings,
  onClose,
  onSave,
}: {
  settings: BillingSettings;
  onClose: () => void;
  onSave: (settings: BillingSettings) => void;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState<BillingSettings>(() =>
    structuredClone(settings),
  );
  const [activePlanId, setActivePlanId] = useState(
    () => settings.plans[0]?.id ?? "",
  );
  const [newFeature, setNewFeature] = useState("");

  const activePlan =
    draft.plans.find((plan) => plan.id === activePlanId) ?? draft.plans[0];

  // Escape closes the editor.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function updatePlan(planId: string, patch: Partial<BillingPlan>) {
    setDraft((current) => ({
      ...current,
      plans: current.plans.map((plan) =>
        plan.id === planId ? { ...plan, ...patch } : plan,
      ),
    }));
  }

  function updateFeature(planId: string, key: string, value: FeatureValue) {
    setDraft((current) => ({
      ...current,
      plans: current.plans.map((plan) =>
        plan.id === planId
          ? { ...plan, features: { ...plan.features, [key]: value } }
          : plan,
      ),
    }));
  }

  function addFeature() {
    const key = newFeature.trim();
    if (!key || draft.featureKeys.includes(key)) return;

    setDraft((current) => ({
      ...current,
      featureKeys: [...current.featureKeys, key],
      plans: current.plans.map((plan) => ({
        ...plan,
        features: { ...plan.features, [key]: false },
      })),
    }));
    setNewFeature("");
  }

  function removeFeature(key: string) {
    setDraft((current) => ({
      ...current,
      featureKeys: current.featureKeys.filter((item) => item !== key),
      plans: current.plans.map((plan) => {
        const features = { ...plan.features };
        delete features[key];
        return { ...plan, features };
      }),
    }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-3 sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id={titleId} className="text-[15px] font-semibold text-ink-900">
              Edit billing plans
            </h2>
            <p className="mt-1 text-[12px] text-ink-500">
              Admin only. Prices, discount and every feature value update the
              plans immediately.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LuX className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <EditorField
              label="Annual discount (%)"
              hint="Applied to the monthly price on the annual toggle."
            >
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={draft.annualDiscountPercent}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setDraft((current) => ({
                    ...current,
                    annualDiscountPercent: Number.isFinite(next)
                      ? Math.min(100, Math.max(0, next))
                      : 0,
                  }));
                }}
                className={FIELD_INPUT}
              />
            </EditorField>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setDraft(structuredClone(DEFAULT_SETTINGS))}
                className={`${SECONDARY_BUTTON} w-full justify-center`}
              >
                Reset to defaults
              </button>
            </div>
          </div>

          {/* Plan picker */}
          <div
            className="mt-4 flex flex-wrap gap-2"
            role="group"
            aria-label="Choose a plan to edit"
          >
            {draft.plans.map((plan) => {
              const active = plan.id === activePlan?.id;

              return (
                <button
                  key={plan.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActivePlanId(plan.id)}
                  className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                    active
                      ? "border-brand-500 bg-brand-500/10 text-brand-700"
                      : "border-line text-ink-500 hover:border-line-strong hover:text-ink-900"
                  }`}
                >
                  {plan.name}
                </button>
              );
            })}
          </div>

          {activePlan ? (
            <div className="mt-4 rounded-xl border border-line p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <EditorField label="Plan name">
                  <input
                    type="text"
                    value={activePlan.name}
                    onChange={(event) =>
                      updatePlan(activePlan.id, { name: event.target.value })
                    }
                    className={FIELD_INPUT}
                  />
                </EditorField>

                <EditorField
                  label="Monthly price (per agent)"
                  hint="Annual prices are calculated from this value."
                >
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={activePlan.price}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      updatePlan(activePlan.id, {
                        price: Number.isFinite(next) ? Math.max(0, next) : 0,
                      });
                    }}
                    className={FIELD_INPUT}
                  />
                </EditorField>
              </div>

              <div className="mt-3">
                <EditorField label="Description">
                  <input
                    type="text"
                    value={activePlan.description}
                    onChange={(event) =>
                      updatePlan(activePlan.id, {
                        description: event.target.value,
                      })
                    }
                    className={FIELD_INPUT}
                  />
                </EditorField>
              </div>

              <label className="mt-3 flex items-center gap-2 text-[12px] font-medium text-ink-700">
                <input
                  type="checkbox"
                  checked={activePlan.popular}
                  onChange={(event) => {
                    const popular = event.target.checked;
                    setDraft((current) => ({
                      ...current,
                      plans: current.plans.map((plan) => ({
                        ...plan,
                        popular: plan.id === activePlan.id ? popular : false,
                      })),
                    }));
                  }}
                  className="h-4 w-4 accent-brand-500"
                />
                Mark as most popular
              </label>

              <div className="mt-4 border-t border-line pt-3">
                <p className="text-[12px] font-medium text-ink-700">Features</p>
                <p className="mt-0.5 text-[11px] text-ink-400">
                  Leave blank or uncheck for “not included”. Text values are
                  shown as-is.
                </p>

                <div className="mt-2.5 space-y-2">
                  {draft.featureKeys.map((key) => {
                    const value = activePlan.features[key];

                    return (
                      <div
                        key={key}
                        className="flex items-center gap-2 rounded-lg border border-line px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-700">
                          {key}
                        </span>

                        {typeof value === "boolean" ? (
                          <label className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-ink-500">
                            <input
                              type="checkbox"
                              checked={value}
                              onChange={(event) =>
                                updateFeature(
                                  activePlan.id,
                                  key,
                                  event.target.checked,
                                )
                              }
                              className="h-3.5 w-3.5 accent-brand-500"
                            />
                            Included
                          </label>
                        ) : (
                          <input
                            type="text"
                            value={value ?? ""}
                            placeholder="Not included"
                            onChange={(event) =>
                              updateFeature(
                                activePlan.id,
                                key,
                                event.target.value,
                              )
                            }
                            className="w-40 shrink-0 rounded-md border border-line px-2 py-1 text-[12px] text-ink-900 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
                          />
                        )}

                        <button
                          type="button"
                          onClick={() => removeFeature(key)}
                          aria-label={`Remove ${key} from all plans`}
                          title={`Remove ${key} from all plans`}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                        >
                          <LuX className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-2.5 flex gap-2">
                  <input
                    type="text"
                    value={newFeature}
                    placeholder="Add a feature (e.g. API access)"
                    onChange={(event) => setNewFeature(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addFeature();
                      }
                    }}
                    className={`${FIELD_INPUT} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={addFeature}
                    className={SECONDARY_BUTTON}
                  >
                    <LuPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className={PRIMARY_BUTTON}
          >
            Save changes
          </button>
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Billing — plan comparison rendered inside the dashboard shell. Content only:
 * the shell supplies the page heading, sidebar and navbar.
 */
export function Billing() {
  const [settings, setSettings] = useState<BillingSettings>(loadSettings);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [editorOpen, setEditorOpen] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<BillingPlan | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const email = useSelector((state: RootState) => state.auth.user?.email ?? "");

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Private mode / quota — keep the in-memory settings working.
    }
  }, [settings]);

  const discount = settings.annualDiscountPercent;

  function openCheckout(plan: BillingPlan) {
    setNotice(null);
    setCheckoutPlan(plan);
  }

  return (
    <div>
      {notice ? (
        <div
          role="status"
          className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-[12.5px] text-brand-800"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notification"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LuX className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* Admin controls + billing cycle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className={SECONDARY_BUTTON}
          >
            <LuPencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit plans
          </button>

          <button
            type="button"
            onClick={() => {
              const target =
                settings.plans.find((plan) => plan.popular) ?? settings.plans[0];
              if (target) openCheckout(target);
            }}
            className={SECONDARY_BUTTON}
          >
            Change plan
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
            {CYCLE_OPTIONS.map((option) => {
              const active = cycle === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCycle(option.id)}
                  className={`rounded-[9px] px-3.5 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
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

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {settings.plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            cycle={cycle}
            discount={discount}
            featureKeys={settings.featureKeys}
            onBuy={openCheckout}
          />
        ))}
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-400">
        Prices are per agent, per month. Annual billing is charged once a year
        at {discount}% off the monthly price; plan features stay the same.
      </p>

      <div className="mt-8">
        <BillingTransaction />
      </div>

      {editorOpen ? (
        <BillingEditor
          settings={settings}
          onClose={() => setEditorOpen(false)}
          onSave={(next) => {
            setSettings(next);
            setEditorOpen(false);
          }}
        />
      ) : null}

      {checkoutPlan ? (
        <PlanCheckout
          key={checkoutPlan.id}
          plan={checkoutPlan}
          discountPercent={discount}
          email={email}
          onClose={() => setCheckoutPlan(null)}
          onSubscribed={({ planName, cycle: chosenCycle, last4 }) => {
            setCheckoutPlan(null);
            setNotice(
              `Subscribed to ${planName} (${chosenCycle}) — card ending ${last4}.`,
            );
          }}
        />
      ) : null}
    </div>
  );
}
