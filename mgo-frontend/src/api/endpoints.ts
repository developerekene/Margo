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
/* Tenant users                                                               */
/* -------------------------------------------------------------------------- */

/** One member row returned by `GET /api/v1/identity/{tenant_id}/users`. */
export type TenantUser = {
  uid: string;
  email: string;
  name: string;
  /** `company_owner`, `company_admin` or `company_member`. */
  role: string;
  /** `active`, `invited`, `disabled` … */
  status: string;
  invited_by: string | null;
  created_at: string;
};

/** `data` of `GET /api/v1/identity/{tenant_id}/users`. */
export type TenantUsersResponse = {
  users: TenantUser[];
  /** Pass back as `cursor` to fetch the next page. */
  next_cursor: string | null;
};

/** Arguments for `listTenantUsers` — `limit` is 1–100 on the backend. */
export type ListTenantUsersArgs = {
  tenant_id: string;
  limit?: number;
  cursor?: string;
};

/** Body of `POST /api/v1/identity/{tenant_id}/users/invite`. */
export type InviteRequest = {
  email: string;
  /** `platform_admin` cannot be granted through the invite flow. */
  role: "company_admin" | "company_member";
  name: string;
};

/** `data` of `POST /api/v1/identity/{tenant_id}/users/invite`. */
export type InviteResponse = {
  status: string;
  email: string;
};

/** `data` of `GET /api/v1/identity/{tenant_id}/users/invite`. */
export type PendingInvitesResponse = {
  invites: TenantUser[];
  next_cursor: string | null;
};

/** Arguments for `inviteUser` — the tenant comes from the URL. */
export type InviteUserArgs = InviteRequest & { tenant_id: string };

/** `data` of `DELETE /api/v1/identity/{tenant_id}/users/{user_id}`. */
export type RemoveUserResponse = {
  status: string;
};

/** Arguments for `removeUser`. */
export type RemoveUserArgs = {
  tenant_id: string;
  /** `uid` of the member to remove. */
  userId: string;
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

/** Only the slice this api needs — importing `RootState` would be circular. */
type AuthStateLike = { auth?: { token?: string | null } };

/** Append `limit`/`cursor` to a path only when they are set. */
function pagedUrl(path: string, limit?: number, cursor?: string): string {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);

  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export const api = createApi({
  reducerPath: "api",

  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE,

    // Tenant-scoped routes are guarded, so attach the Firebase ID token that
    // `loginSucceeded` stored in the auth slice.
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as AuthStateLike).auth?.token;
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return headers;
    },

    headers: {
      "Content-Type": "application/json",
    },
  }),

  tagTypes: ["TenantUsers", "PendingInvites"],

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

    /**
     * GET /api/v1/identity/{tenant_id}/users — members of a tenant.
     * Requires a company_owner / company_admin of that tenant (or platform_admin).
     */
    listTenantUsers: builder.query<TenantUsersResponse, ListTenantUsersArgs>({
      query: ({ tenant_id, limit, cursor }) => ({
        url: pagedUrl(
          `/api/v1/identity/${encodeURIComponent(tenant_id)}/users`,
          limit,
          cursor,
        ),
        method: "GET",
      }),
      transformResponse: (response: Envelope<TenantUsersResponse>) =>
        response.data as TenantUsersResponse,
      providesTags: (_result, _error, { tenant_id }) => [
        { type: "TenantUsers", id: tenant_id },
      ],
    }),

    /**
     * POST /api/v1/identity/{tenant_id}/users/invite — invite an admin/member.
     * Owner or admin of the tenant only.
     */
    inviteUser: builder.mutation<InviteResponse, InviteUserArgs>({
      query: ({ tenant_id, ...body }) => ({
        url: `/api/v1/identity/${encodeURIComponent(tenant_id)}/users/invite`,
        method: "POST",
        body,
      }),
      transformResponse: (response: Envelope<InviteResponse>) =>
        response.data as InviteResponse,
      // A new invite shows up in both lists for this tenant.
      invalidatesTags: (_result, _error, { tenant_id }) => [
        { type: "TenantUsers", id: tenant_id },
        { type: "PendingInvites", id: tenant_id },
      ],
    }),

    /**
     * DELETE /api/v1/identity/{tenant_id}/users/{user_id} — remove a member.
     * Owner or admin of the tenant; roles are enforced hierarchically on the
     * backend (an admin cannot remove the owner).
     */
    removeUser: builder.mutation<RemoveUserResponse, RemoveUserArgs>({
      query: ({ tenant_id, userId }) => ({
        url: `/api/v1/identity/${encodeURIComponent(
          tenant_id,
        )}/users/${encodeURIComponent(userId)}`,
        method: "DELETE",
      }),
      transformResponse: (response: Envelope<RemoveUserResponse>) =>
        response.data as RemoveUserResponse,
      invalidatesTags: (_result, _error, { tenant_id }) => [
        { type: "TenantUsers", id: tenant_id },
        { type: "PendingInvites", id: tenant_id },
      ],
    }),

    /**
     * GET /api/v1/identity/{tenant_id}/users/invite — invites still pending.
     * Same paging shape as `listTenantUsers`.
     */
    listPendingInvites: builder.query<
      PendingInvitesResponse,
      ListTenantUsersArgs
    >({
      query: ({ tenant_id, limit, cursor }) => ({
        url: pagedUrl(
          `/api/v1/identity/${encodeURIComponent(tenant_id)}/users/invite`,
          limit,
          cursor,
        ),
        method: "GET",
      }),
      transformResponse: (response: Envelope<PendingInvitesResponse>) =>
        response.data as PendingInvitesResponse,
      providesTags: (_result, _error, { tenant_id }) => [
        { type: "PendingInvites", id: tenant_id },
      ],
    }),
  }),
});

export const {
  useRegisterMutation,
  useForgotPasswordMutation,
  useLoginMutation,
  useResendVerificationMutation,
  useListTenantUsersQuery,
  useInviteUserMutation,
  useRemoveUserMutation,
  useListPendingInvitesQuery,
} = api;

/** Backend message for a rejected request, or a safe fallback. */
export function getApiErrorMessage(error: unknown): string {
  const result = error as ApiErrorResult;
  return (
    result?.data?.error?.message ?? "Something went wrong. Please try again."
  );
}
