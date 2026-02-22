/**
 * AFFiNE WebSocket Service
 *
 * Manages a persistent Socket.IO connection for Yjs document operations.
 * Handles workspace join, doc loading, update pushing, and sequential write discipline.
 */

import { io, Socket } from "socket.io-client";
import {
  AFFINE_BASE_URL,
  AFFINE_WORKSPACE_ID,
  AFFINE_CLIENT_VERSION,
  SOCKET_IO_PATH,
  WS_RECONNECT_BASE_DELAY,
  WS_RECONNECT_MAX_DELAY,
} from "../constants.js";
import { getSessionCookies, clearSession } from "./auth.js";
import type { JoinResult, LoadDocResult, PushUpdateResult } from "../types.js";

let socket: Socket | null = null;
let joined = false;

/** Per-doc write queues to enforce sequential write discipline */
const writeQueues = new Map<string, Promise<void>>();

/**
 * Emit a Socket.IO event and wait for its callback response.
 */
function emitWithCallback<T>(
  sock: Socket,
  event: string,
  data: unknown
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`WebSocket: ${event} timed out after 30s`));
    }, 30000);

    sock.emit(event, data, (response: { data?: T; error?: string }) => {
      clearTimeout(timer);
      if (response?.error) {
        reject(new Error(`WebSocket ${event} error: ${response.error}`));
      } else if (response?.data !== undefined) {
        resolve(response.data as T);
      } else {
        // Some events return the response directly
        resolve(response as unknown as T);
      }
    });
  });
}

/**
 * Establish and maintain a WebSocket connection.
 * Returns the connected and workspace-joined socket.
 */
export async function getSocket(): Promise<Socket> {
  if (socket?.connected && joined) {
    return socket;
  }

  // Disconnect any stale socket
  if (socket) {
    socket.disconnect();
    socket = null;
    joined = false;
  }

  const cookies = await getSessionCookies();

  return new Promise<Socket>((resolve, reject) => {
    const sock = io(AFFINE_BASE_URL, {
      path: SOCKET_IO_PATH,
      transports: ["websocket"],
      extraHeaders: {
        Cookie: cookies,
      },
      reconnection: true,
      reconnectionDelay: WS_RECONNECT_BASE_DELAY,
      reconnectionDelayMax: WS_RECONNECT_MAX_DELAY,
      timeout: 30000,
    });

    const connectTimeout = setTimeout(() => {
      sock.disconnect();
      reject(new Error("WebSocket: Connection timed out after 30s"));
    }, 30000);

    sock.on("connect", async () => {
      clearTimeout(connectTimeout);
      console.error("WebSocket: Connected");

      try {
        // Join the workspace
        const joinResult = await emitWithCallback<JoinResult>(
          sock,
          "space:join",
          {
            spaceType: "workspace",
            spaceId: AFFINE_WORKSPACE_ID,
            clientVersion: AFFINE_CLIENT_VERSION,
          }
        );

        if (!joinResult.success) {
          sock.disconnect();
          reject(
            new Error(
              `WebSocket: space:join failed. Check clientVersion (using "${AFFINE_CLIENT_VERSION}") or auth.`
            )
          );
          return;
        }

        console.error(
          `WebSocket: Joined workspace ${AFFINE_WORKSPACE_ID} (clientId: ${joinResult.clientId})`
        );
        socket = sock;
        joined = true;
        resolve(sock);
      } catch (err) {
        sock.disconnect();
        reject(err);
      }
    });

    sock.on("connect_error", (err) => {
      clearTimeout(connectTimeout);
      console.error(`WebSocket: Connection error: ${err.message}`);
      reject(
        new Error(`WebSocket: Connection failed: ${err.message}`)
      );
    });

    sock.on("disconnect", (reason) => {
      console.error(`WebSocket: Disconnected (${reason})`);
      joined = false;
      if (reason === "io server disconnect") {
        // Server kicked us — clear auth and let next call reconnect
        clearSession();
      }
    });
  });
}

/**
 * Load a document via WebSocket.
 * Returns the base64-encoded Yjs update (in the `missing` field).
 */
export async function loadDoc(docId: string): Promise<LoadDocResult> {
  const sock = await getSocket();

  const result = await emitWithCallback<LoadDocResult>(
    sock,
    "space:load-doc",
    {
      spaceType: "workspace",
      spaceId: AFFINE_WORKSPACE_ID,
      docId,
    }
  );

  if (!result.missing && !result.state) {
    throw new Error(`DOC_NOT_FOUND: Document "${docId}" does not exist`);
  }

  return result;
}

/**
 * Push a Yjs update to the server.
 * Enforces sequential writes per document.
 */
export async function pushDocUpdate(
  docId: string,
  updateBase64: string
): Promise<PushUpdateResult> {
  // Queue writes per document to prevent CRDT scrambling
  const previous = writeQueues.get(docId) ?? Promise.resolve();

  const current = previous.then(async () => {
    const sock = await getSocket();

    const result = await emitWithCallback<PushUpdateResult>(
      sock,
      "space:push-doc-update",
      {
        spaceType: "workspace",
        spaceId: AFFINE_WORKSPACE_ID,
        docId,
        update: updateBase64,
      }
    );

    if (!result.accepted) {
      throw new Error(
        `Push rejected for doc "${docId}". Possible conflict — try re-reading the doc first.`
      );
    }

    return result;
  });

  // Store the queue chain (strip the return value for the map)
  writeQueues.set(
    docId,
    current.then(() => {})
  );

  return current;
}

/**
 * Delete a document via WebSocket.
 * Note: This emits a fire-and-forget event (no callback).
 */
export async function deleteDoc(docId: string): Promise<void> {
  const sock = await getSocket();

  sock.emit("space:delete-doc", {
    spaceType: "workspace",
    spaceId: AFFINE_WORKSPACE_ID,
    docId,
  });

  // Give the server a moment to process
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.error(`WebSocket: Deleted doc ${docId}`);
}

/**
 * Disconnect the WebSocket cleanly.
 */
export function disconnect(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    joined = false;
    writeQueues.clear();
    console.error("WebSocket: Disconnected");
  }
}
