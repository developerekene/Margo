import { createSlice, nanoid } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import type { ChatMessage, ChatRole } from "../../ui/pages/chatbotdata";
import { initialMessages } from "../../ui/pages/chatbotdata";

type ChatState = {
  messages: ChatMessage[];
  /** True while the assistant is "thinking". */
  typing: boolean;
};

const initialState: ChatState = {
  messages: initialMessages,
  typing: false,
};

/** Id of the first assistant message, so the greeting can be rewritten in place. */
export const WELCOME_ID = "welcome";

const chatSlice = createSlice({
  name: "chat",
  initialState,

  reducers: {
    /** Append one message; the id is generated for the caller. */
    messageAdded: {
      reducer(state, action: PayloadAction<ChatMessage>) {
        state.messages.push(action.payload);
      },
      prepare(role: ChatRole, text: string) {
        const payload: ChatMessage = { id: nanoid(), role, text };
        return { payload };
      },
    },

    /** Keeps the opening greeting in step with the Agent settings. */
    welcomeMessageChanged(state, action: PayloadAction<string>) {
      const welcome = state.messages.find(
        (message) => message.id === WELCOME_ID,
      );

      if (welcome) {
        welcome.text = action.payload;
      } else {
        state.messages.unshift({
          id: WELCOME_ID,
          role: "bot",
          text: action.payload,
        });
      }
    },

    typingChanged(state, action: PayloadAction<boolean>) {
      state.typing = action.payload;
    },

    chatReset(state) {
      state.messages = initialMessages;
      state.typing = false;
    },
  },
});

export const { messageAdded, typingChanged, chatReset, welcomeMessageChanged } =
  chatSlice.actions;

export default chatSlice.reducer;
