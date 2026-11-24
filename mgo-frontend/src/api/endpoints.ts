import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

/* -------------------------------------------------------------------------- */
/* Payloads                                                                   */
/* -------------------------------------------------------------------------- */

/** Body of `POST /api/v1/identity/register` (FastAPI snake_case model). */
export type RegisterRequest = {
  company_name: string;
  company_email: string;
  admin_name: string;
  password: string;
  website_url?: string;
};

/**
 * `data` of `POST /api/v1/identity/register`.
 * No token is issued — the account stays unusable until the emailed link is opened.
 */
export type RegisterResponse = {
  status: string;
  email: string;
  message: string;
};

/** Body of `POST /api/v1/identity/forgot-password`. */
export type ForgotPasswordRequest = {
  email: string;
};

/** `data` of `POST /api/v1/identity/forgot-password` (same reply for every email). */
export type ForgotPasswordResponse = {
  message: string;
};

/** Body of `POST /api/v1/identity/login`. */
export type LoginRequest = {
  email: string;
  password: string;
};
/** `data` of `POST /api/v1/identity/login` — a verified Firebase session. */
export type LoginResponse = {
  token: string;
  uid: string;
  role: string;
  tenant_id: string | null;
  email: string;
  display_name: string | null;
  company_name: string | null;
};

/** Body of `POST /api/v1/identity/resend-verification`. */
export type ResendVerificationRequest = {
  email: string;
};

/**
 * `data` of `POST /api/v1/identity/resend-verification`.
 * The reply is identical for known and unknown addresses (rate-limited per
 * address), so callers must not treat it as proof the mailbox exists.
 */
export type ResendVerificationResponse = {
  message: string;
};

/* -------------------------------------------------------------------------- */
/* Billing / usage payloads                                                   */
/* -------------------------------------------------------------------------- */

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

/** Every backend response is wrapped as `{ data, error }`. */
type Envelope<T> = {
  data: T | null;
  error: { code?: string; message?: string } | null;
};

/** Shape `unwrap()` rejects with for this API. */
export type ApiErrorResult = {
  status?: number | string;
  data?: Envelope<never>;
};

/**
 * Origin of the Margo API. Set `VITE_API_URL` for the deployed backend; the
 * empty default keeps requests same-origin so the Vite proxy (`/api` → Render)
 * handles them in development.
 */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? "";

export const api = createApi({
  reducerPath: "api",

  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE,
    headers: {
      "Content-Type": "application/json",
    },
  }),

  endpoints: (builder) => ({
    register: builder.mutation<RegisterResponse, RegisterRequest>({
      query: (body) => ({
        url: "/api/v1/identity/register",
        method: "POST",
        body,
      }),
      // Unwrap the `{ data, error }` envelope so callers get the payload.
      transformResponse: (response: Envelope<RegisterResponse>) =>
        response.data as RegisterResponse,
    }),

    forgotPassword: builder.mutation<
      ForgotPasswordResponse,
      ForgotPasswordRequest
    >({
      query: (body) => ({
        url: "/api/v1/identity/forgot-password",
        method: "POST",
        body,
      }),
      transformResponse: (response: Envelope<ForgotPasswordResponse>) =>
        response.data as ForgotPasswordResponse,
    }),

    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({
        url: "/api/v1/identity/login",
        method: "POST",
        body,
      }),
      transformResponse: (response: Envelope<LoginResponse>) =>
        response.data as LoginResponse,
    }),

    resendVerification: builder.mutation<
      ResendVerificationResponse,
      ResendVerificationRequest
    >({
      query: (body) => ({
        url: "/api/v1/identity/resend-verification",
        method: "POST",
        body,
      }),
      transformResponse: (response: Envelope<ResendVerificationResponse>) =>
        response.data as ResendVerificationResponse,
    }),
  }),
});

export const {
  useRegisterMutation,
  useForgotPasswordMutation,
  useLoginMutation,
  useResendVerificationMutation,
} = api;

/** Backend message for a rejected request, or a safe fallback. */
export function getApiErrorMessage(error: unknown): string {
  const result = error as ApiErrorResult;
  return (
    result?.data?.error?.message ?? "Something went wrong. Please try again."
  );
}
