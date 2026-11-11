import { ApiError, type Endpoint } from "./client";
import { mockSubscription, mockUsage } from "./usageMock";

/* -------------------------------------------------------------------------- */
/* Payloads                                                                   */
/* -------------------------------------------------------------------------- */

export type SignUpBody = {
  adminName: string;
  companyName: string;
  websiteUrl: string;
  email: string;
  password: string;
};

export type SignInBody = {
  email: string;
  password: string;
};

export type Session = {
  token: string;
  email: string;
  name: string;
};

export type ChatBody = {
  text: string;
};

export type ChatReply = {
  reply: string;
};

export type BillingPeriod = {
  /** Inclusive `YYYY-MM-DD`. */
  start: string;
  /** Inclusive `YYYY-MM-DD`. */
  end: string;
};

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled";

export type Subscription = {
  planId: string;
  cycle: "monthly" | "annual";
  status: SubscriptionStatus;
  /** First day of the subscription, `YYYY-MM-DD`. */
  startedAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
};

export type UsageQuery = {
  periodStart: string;
  periodEnd: string;
};

/** Actual consumption for a single billing period. */
export type UsageSnapshot = {
  periodStart: string;
  periodEnd: string;
  conversations: number;
  tableRows: number;
  /** Vector database storage in MB. */
  vectorStorageMb: number;
  /** Uploaded file storage in MB. */
  fileStorageMb: number;
  /** AI spend in the workspace billing currency. */
  aiSpend: number;
};

/* -------------------------------------------------------------------------- */
/* Stand-ins for the backend                                                  */
/* -------------------------------------------------------------------------- */

const accounts = new Map<string, { name: string; password: string }>();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- */
/* Route map                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Every Margo API route, grouped by module.
 *
 * Growing the API = adding one entry here; `call()` in `client.ts` handles the
 * rest. Delete each `mock` once the backend serves that route.
 */
export const endpoints = {
  identity: {
    signUp: {
      method: "POST",
      path: "/identity/signup",
      mock: async (body: SignUpBody): Promise<Session> => {
        await wait(800);

        const email = body.email.trim().toLowerCase();
        if (accounts.has(email)) {
          throw new ApiError(
            "An account with this email already exists.",
            409,
            "email_taken",
          );
        }

        accounts.set(email, {
          name: body.adminName,
          password: body.password,
        });
        return { token: crypto.randomUUID(), email, name: body.adminName };
      },
    } satisfies Endpoint<SignUpBody, Session>,

    signIn: {
      method: "POST",
      path: "/identity/signin",
      mock: async (body: SignInBody): Promise<Session> => {
        await wait(700);

        const email = body.email.trim().toLowerCase();
        const account = accounts.get(email);

        // No backend: unknown emails are accepted, registered ones must match.
        if (account && account.password !== body.password) {
          throw new ApiError(
            "That email and password don't match.",
            401,
            "invalid_credentials",
          );
        }

        return {
          token: crypto.randomUUID(),
          email,
          name: account?.name ?? email.split("@")[0],
        };
      },
    } satisfies Endpoint<SignInBody, Session>,
  },

  chat: {
    /** POST /api/v1/chat/messages */
    sendMessage: {
      method: "POST",
      path: "/chat/messages",
      mock: async (body: ChatBody): Promise<ChatReply> => {
        await wait(700);
        return {
          reply: `You said: "${body.text}". Connect the API for real answers.`,
        };
      },
    } satisfies Endpoint<ChatBody, ChatReply>,
  },

  billing: {
    /** GET /api/v1/billing/subscription */
    subscription: {
      method: "GET",
      path: "/billing/subscription",
      mock: async (): Promise<Subscription | null> => {
        await wait(450);
        return mockSubscription();
      },
    } satisfies Endpoint<undefined, Subscription | null>,
  },

  usage: {
    /** POST /api/v1/usage/summary */
    summary: {
      method: "POST",
      path: "/usage/summary",
      mock: async (body: UsageQuery): Promise<UsageSnapshot> => {
        await wait(600);
        return mockUsage(body.periodStart, body.periodEnd);
      },
    } satisfies Endpoint<UsageQuery, UsageSnapshot>,
  },

  // Add the next module here.
};
