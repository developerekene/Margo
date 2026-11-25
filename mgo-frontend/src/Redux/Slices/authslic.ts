import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import type { LoginResponse } from "../../api/endpoints";

export interface User {
  company_name: string;
  company_email: string;
  admin_name: string;
  website_url: string;
}

interface AuthState {
  user: User | null;
  /** Firebase ID token — present only after a verified sign-in. */
  token: string | null;
  /** Tenant the signed-in account belongs to; `null` for platform_admin. */
  tenant_id: string | null;
  /** `company_owner`, `company_admin`, `company_member` or `platform_admin`. */
  role: string | null;
  isAuthenticated: boolean;
}

const SESSION_KEY = "margo:session";

const EMPTY_STATE: AuthState = {
  user: null,
  token: null,
  tenant_id: null,
  role: null,
  isAuthenticated: false,
};

function isUser(value: unknown): value is User {
  if (!value || typeof value !== "object") return false;

  const user = value as Partial<User>;

  return (
    typeof user.company_name === "string" &&
    typeof user.company_email === "string" &&
    typeof user.admin_name === "string" &&
    typeof user.website_url === "string"
  );
}

/**
 * Restore the session from a previous visit. The backend is stateless (it only
 * checks the bearer token), so keeping the token here is all a refresh needs.
 */
export function loadAuthState(): AuthState {
  if (typeof window === "undefined") return EMPTY_STATE;

  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return EMPTY_STATE;

    const parsed = JSON.parse(raw) as {
      user?: unknown;
      token?: unknown;
      tenant_id?: unknown;
      role?: unknown;
    };

    if (typeof parsed.token !== "string" || !isUser(parsed.user)) {
      return EMPTY_STATE;
    }

    return {
      user: parsed.user,
      token: parsed.token,
      tenant_id: typeof parsed.tenant_id === "string" ? parsed.tenant_id : null,
      role: typeof parsed.role === "string" ? parsed.role : null,
      isAuthenticated: true,
    };
  } catch {
    return EMPTY_STATE;
  }
}

/** Mirror the session to storage; signing out removes it. */
export function persistAuthState(state: AuthState) {
  if (typeof window === "undefined") return;

  try {
    if (!state.token || !state.user) {
      window.localStorage.removeItem(SESSION_KEY);
      return;
    }

    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        user: state.user,
        token: state.token,
        tenant_id: state.tenant_id,
        role: state.role,
      }),
    );
  } catch {
    // Storage unavailable — the session just won't survive a reload.
  }
}

const initialState: AuthState = loadAuthState();

const authSlice = createSlice({
  name: "auth",
  initialState,

  reducers: {
    signupSuccess: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
    },

    /** `POST /identity/login` succeeded — keep the session and its profile. */
    loginSucceeded: (state, action: PayloadAction<LoginResponse>) => {
      const { token, email, display_name, company_name, tenant_id, role } =
        action.payload;

      state.user = {
        company_name: company_name ?? "",
        company_email: email,
        // Accounts created without a display name fall back to the email local
        // part so the dashboard never greets an empty string.
        admin_name: display_name?.trim() || email.split("@")[0],
        website_url: state.user?.website_url ?? "",
      };
      state.token = token;
      state.tenant_id = tenant_id;
      state.role = role;
      state.isAuthenticated = true;
    },

    logout: (state) => {
      state.user = null;
      state.token = null;
      state.tenant_id = null;
      state.role = null;
      state.isAuthenticated = false;

      // Drop the saved session immediately as well, so a reload right after
      // signing out can never restore it (the store subscription also clears
      // it, this just removes the timing dependency).
      try {
        window.localStorage.removeItem(SESSION_KEY);
      } catch {
        // Storage unavailable — nothing to clear.
      }
    },

    /** Settings page — profile / workspace edits applied to the account. */
    profileUpdated: (state, action: PayloadAction<Partial<User>>) => {
      if (!state.user) return;
      state.user = { ...state.user, ...action.payload };
    },
  },
});

export const { signupSuccess, loginSucceeded, logout, profileUpdated } =
  authSlice.actions;

export default authSlice.reducer;
