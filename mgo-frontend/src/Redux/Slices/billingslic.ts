import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type FeatureValue = string | boolean;

/** Hard usage limits read by the Usage page. `null` means unlimited. */
export type PlanLimits = {
  /** Conversations allowed per billing period. */
  conversations: number | null;
  /** Rows stored across knowledge tables. */
  tableRows: number | null;
  /** Vector database storage in MB. */
  vectorStorageMb: number | null;
  /** Uploaded file storage in MB. */
  fileStorageMb: number | null;
  /** AI spend allowance per period, in `BillingSettings.currency`. */
  aiSpend: number | null;
};

export type BillingPlan = {
  id: string;
  name: string;
  /** Monthly price per agent. */
  price: number;
  description: string;
  popular: boolean;
  features: Record<string, FeatureValue>;
  /** The Usage page compares consumption against these values. */
  limits: PlanLimits;
};

export type BillingCycle = "monthly" | "annual";

export type BillingSettings = {
  /** Applied to the monthly price when annual billing is selected. */
  annualDiscountPercent: number;
  /** ISO 4217 code used for plan prices, AI spend and invoices. */
  currency: string;
  /** Row order for the comparison table; also the editable feature catalog. */
  featureKeys: string[];
  plans: BillingPlan[];
};

/* -------------------------------------------------------------------------- */
/* Defaults                                                                   */
/* -------------------------------------------------------------------------- */

/** Used only when a stored plan has no limits to migrate from. */
const FALLBACK_LIMITS: PlanLimits = {
  conversations: 500,
  tableRows: 5_000,
  vectorStorageMb: 50,
  fileStorageMb: 100,
  aiSpend: 2,
};

export const DEFAULT_SETTINGS: BillingSettings = {
  annualDiscountPercent: 10,
  currency: "USD",
  featureKeys: [
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
      limits: {
        conversations: 500,
        tableRows: 5_000,
        vectorStorageMb: 50,
        fileStorageMb: 100,
        aiSpend: 2,
      },
      features: {
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
      limits: {
        conversations: null,
        tableRows: 50_000,
        vectorStorageMb: 512,
        fileStorageMb: 1_024,
        aiSpend: 10,
      },
      features: {
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
      limits: {
        conversations: null,
        tableRows: 250_000,
        vectorStorageMb: 2_048,
        fileStorageMb: 5_120,
        aiSpend: 50,
      },
      features: {
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
      limits: {
        conversations: null,
        tableRows: null,
        vectorStorageMb: 10_240,
        fileStorageMb: 25_600,
        aiSpend: 250,
      },
      features: {
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
export const STORAGE_KEY = "margo:billing";

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Conversations are derived from `limits.conversations`, so the marketing
 * feature list must not carry a second, editable copy of that number.
 */
function normaliseFeatures(
  features: Record<string, unknown>,
): Record<string, FeatureValue> {
  const next: Record<string, FeatureValue> = {};

  for (const [key, value] of Object.entries(features)) {
    if (key === "Conversations") continue;
    if (typeof value === "string" || typeof value === "boolean") {
      next[key] = value;
    }
  }

  return next;
}

function normaliseLimit(
  value: unknown,
  fallback: number | null,
): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  return fallback;
}

function normalisePlan(value: unknown): BillingPlan | null {
  if (!isRecord(value)) return null;

  const { id, name, price, description, popular, features } = value;

  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    typeof description !== "string" ||
    typeof popular !== "boolean" ||
    !isRecord(features)
  ) {
    return null;
  }

  // Plans saved before limits existed inherit them from the matching default.
  const fallback = DEFAULT_SETTINGS.plans.find((plan) => plan.id === id);
  const baseLimits = fallback?.limits ?? FALLBACK_LIMITS;
  const rawLimits = isRecord(value.limits) ? value.limits : {};

  return {
    id,
    name,
    price: Math.max(0, price),
    description,
    popular,
    features: normaliseFeatures(features),
    limits: {
      conversations: normaliseLimit(
        rawLimits.conversations,
        baseLimits.conversations,
      ),
      tableRows: normaliseLimit(rawLimits.tableRows, baseLimits.tableRows),
      vectorStorageMb: normaliseLimit(
        rawLimits.vectorStorageMb,
        baseLimits.vectorStorageMb,
      ),
      fileStorageMb: normaliseLimit(
        rawLimits.fileStorageMb,
        baseLimits.fileStorageMb,
      ),
      aiSpend: normaliseLimit(rawLimits.aiSpend, baseLimits.aiSpend),
    },
  };
}

/** Read the admin's billing configuration, migrating older saved shapes. */
export function loadBillingSettings(): BillingSettings {
  const fallback = structuredClone(DEFAULT_SETTINGS);

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return fallback;

    const plans = Array.isArray(parsed.plans)
      ? parsed.plans
          .map(normalisePlan)
          .filter((plan): plan is BillingPlan => plan !== null)
      : [];

    const featureKeys = Array.isArray(parsed.featureKeys)
      ? parsed.featureKeys.filter(
          (key): key is string =>
            typeof key === "string" && key !== "Conversations",
        )
      : fallback.featureKeys;

    const discount =
      typeof parsed.annualDiscountPercent === "number"
        ? Math.min(100, Math.max(0, parsed.annualDiscountPercent))
        : fallback.annualDiscountPercent;

    const currency =
      typeof parsed.currency === "string" && /^[A-Z]{3}$/.test(parsed.currency)
        ? parsed.currency
        : fallback.currency;

    return {
      annualDiscountPercent: discount,
      currency,
      featureKeys,
      plans: plans.length ? plans : fallback.plans,
    };
  } catch {
    return fallback;
  }
}

/** Persist the configuration so a reload keeps the admin's plans. */
export function persistBillingSettings(settings: BillingSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode / quota — keep the in-memory settings working.
  }
}

/* -------------------------------------------------------------------------- */
/* Slice                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The billing catalogue is the single source of truth for plan names, limits
 * and currency. The Usage page reads this slice directly, so an admin edit is
 * reflected immediately — no duplicated limit configuration.
 */
const billingSlice = createSlice({
  name: "billing",
  initialState: loadBillingSettings(),

  reducers: {
    billingSettingsSaved(state, action: PayloadAction<BillingSettings>) {
      Object.assign(state, action.payload);
    },

    billingReset() {
      return structuredClone(DEFAULT_SETTINGS);
    },
  },
});

export const { billingSettingsSaved, billingReset } = billingSlice.actions;

export default billingSlice.reducer;
