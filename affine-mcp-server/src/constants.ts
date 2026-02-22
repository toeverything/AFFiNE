/**
 * AFFiNE MCP Server - Constants and Configuration
 */

export const AFFINE_BASE_URL = process.env.AFFINE_BASE_URL || "https://affine.agentic-lawyer.xyz";
export const AFFINE_EMAIL = process.env.AFFINE_EMAIL || "";
export const AFFINE_PASSWORD = process.env.AFFINE_PASSWORD || "";
export const AFFINE_WORKSPACE_ID = process.env.AFFINE_WORKSPACE_ID || "";
export const AFFINE_CLIENT_VERSION = process.env.AFFINE_CLIENT_VERSION || "0.26.2";

/** Maximum response size in characters before truncation */
export const CHARACTER_LIMIT = 25000;

/** Socket.IO reconnection settings */
export const WS_RECONNECT_MAX_DELAY = 30000;
export const WS_RECONNECT_BASE_DELAY = 1000;

/** API request timeout in ms */
export const API_TIMEOUT = 30000;

/** GraphQL endpoint path */
export const GRAPHQL_PATH = "/graphql";

/** Auth endpoint path */
export const AUTH_SIGN_IN_PATH = "/api/auth/sign-in";

/** Socket.IO path */
export const SOCKET_IO_PATH = "/socket.io/";
