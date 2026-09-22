import { call, ApiError } from "./client";
import {
  endpoints,
  type Session,
  type SignInBody,
  type SignUpBody,
} from "./endpoints";

export type { Session, SignInBody, SignUpBody };
export { ApiError };

const SESSION_KEY = "margo.session";

export async function signUp(body: SignUpBody): Promise<Session> {
  return saveSession(await call(endpoints.identity.signUp, body));
}

export async function signIn(body: SignInBody): Promise<Session> {
  return saveSession(await call(endpoints.identity.signIn, body));
}

/**
 * Mock SSO for the Google button.
 * The real flow redirects to Google and comes back with a token.
 */
export async function continueWithGoogle(): Promise<Session> {
  return saveSession({
    token: crypto.randomUUID(),
    email: "ada@example.com",
    name: "Ada Lovelace",
  });
}

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function saveSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}
