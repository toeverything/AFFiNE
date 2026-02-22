/**
 * AFFiNE Authentication Service
 *
 * Handles REST sign-in to obtain session cookies required for WebSocket auth.
 * Bearer tokens work for GraphQL but NOT for WebSocket connections.
 */

import axios from "axios";
import {
  AFFINE_BASE_URL,
  AFFINE_EMAIL,
  AFFINE_PASSWORD,
  AUTH_SIGN_IN_PATH,
  API_TIMEOUT,
} from "../constants.js";
import type { AuthSession } from "../types.js";

let cachedSession: AuthSession | null = null;

/**
 * Sign in via REST and extract session cookies.
 * Caches the session for reuse across requests.
 */
export async function signIn(): Promise<AuthSession> {
  if (cachedSession) {
    return cachedSession;
  }

  if (!AFFINE_EMAIL || !AFFINE_PASSWORD) {
    throw new Error(
      "AFFINE_EMAIL and AFFINE_PASSWORD environment variables are required for authentication"
    );
  }

  const url = `${AFFINE_BASE_URL}${AUTH_SIGN_IN_PATH}`;

  try {
    const response = await axios.post(
      url,
      { email: AFFINE_EMAIL, password: AFFINE_PASSWORD },
      {
        timeout: API_TIMEOUT,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        // Capture Set-Cookie headers without following redirects
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
      }
    );

    const setCookieHeaders = response.headers["set-cookie"];
    if (!setCookieHeaders || setCookieHeaders.length === 0) {
      throw new Error(
        "No session cookies returned from sign-in. Check credentials."
      );
    }

    // Extract cookie name=value pairs (strip attributes like Path, HttpOnly, etc.)
    const cookiePairs = setCookieHeaders
      .map((header: string) => header.split(";")[0].trim())
      .filter((pair: string) => pair.length > 0);

    const cookieString = cookiePairs.join("; ");

    // Verify we have the expected cookies
    const hasSession = cookiePairs.some((p: string) =>
      p.startsWith("affine_session=")
    );
    if (!hasSession) {
      // Some versions may use different cookie names - accept whatever we got
      console.error(
        `Warning: affine_session cookie not found. Got: ${cookiePairs.map((p: string) => p.split("=")[0]).join(", ")}`
      );
    }

    cachedSession = {
      cookies: cookieString,
    };

    console.error(`Auth: Signed in as ${AFFINE_EMAIL}`);
    return cachedSession;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        throw new Error(
          `Auth failed (HTTP ${error.response.status}): ${JSON.stringify(error.response.data)}`
        );
      }
      throw new Error(`Auth failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get current session cookies, signing in if needed.
 */
export async function getSessionCookies(): Promise<string> {
  const session = await signIn();
  return session.cookies;
}

/**
 * Clear cached session to force re-authentication.
 */
export function clearSession(): void {
  cachedSession = null;
  console.error("Auth: Session cleared, will re-authenticate on next request");
}

/**
 * Execute a function with automatic re-auth on failure.
 * If the function throws, clears session and retries once.
 */
export async function withAutoReauth<T>(
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("unauthorized") ||
      msg.includes("session")
    ) {
      console.error("Auth: Request failed, re-authenticating...");
      clearSession();
      return await fn();
    }
    throw error;
  }
}
