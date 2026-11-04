import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

interface User {
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
  },
});

export const { signup, signin, logout } = authSlice.actions;

export default authSlice.reducer;
