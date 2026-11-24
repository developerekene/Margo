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
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,

  reducers: {
    signupSuccess: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
    },

    /** `POST /identity/login` succeeded — keep the session and its profile. */
    loginSucceeded: (state, action: PayloadAction<LoginResponse>) => {
      const { token, email, display_name, company_name } = action.payload;

      state.user = {
        company_name: company_name ?? "",
        company_email: email,
        // Accounts created without a display name fall back to the email local
        // part so the dashboard never greets an empty string.
        admin_name: display_name?.trim() || email.split("@")[0],
        website_url: state.user?.website_url ?? "",
      };
      state.token = token;
      state.isAuthenticated = true;
    },

    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
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
