import { configureStore } from "@reduxjs/toolkit";
import agentReducer from "./Slices/agentslic";
import authReducer from "./Slices/authslic";
import chatReducer from "./Slices/chatslic";

export const store = configureStore({
  reducer: {
    agent: agentReducer,
    auth: authReducer,
    chat: chatReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
