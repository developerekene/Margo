import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

export interface User {
  adminName: string;
  companyName: string;
  websiteUrl: string;
  email: string;
  password: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,

  reducers: {
    signup: (
      state,
      action: PayloadAction<{
        adminName: string;
        companyName: string;
        websiteUrl: string;
        email: string;
        password: string;
      }>,
    ) => {
      console.log("Signup data:", action.payload);

      state.user = action.payload;
      state.isAuthenticated = true;
    },

    signin: (state, action: PayloadAction<{ email: string }>) => {
      console.log("Signin data:", action.payload);

      if (state.user) {
        state.user.email = action.payload.email;
      }

      state.isAuthenticated = true;
    },

    logout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
    },

    /** Settings page — profile / workspace edits applied to the signed-in user. */
    profileUpdated: (
      state,
      action: PayloadAction<Partial<Omit<User, "password">>>,
    ) => {
      if (!state.user) return;
      state.user = { ...state.user, ...action.payload };
    },

    passwordChanged: (state, action: PayloadAction<{ password: string }>) => {
      if (!state.user) return;
      state.user.password = action.payload.password;
    },
  },
});

export const { signup, signin, logout, profileUpdated, passwordChanged } =
  authSlice.actions;

export default authSlice.reducer;
