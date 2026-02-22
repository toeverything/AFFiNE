/**
 * AFFiNE GraphQL Client
 *
 * Handles GraphQL queries and mutations for comments, user info, and doc metadata.
 */

import axios from "axios";
import {
  AFFINE_BASE_URL,
  AFFINE_WORKSPACE_ID,
  GRAPHQL_PATH,
  API_TIMEOUT,
} from "../constants.js";
import { getSessionCookies, withAutoReauth } from "./auth.js";
import type { CommentData } from "../types.js";

/**
 * Execute a GraphQL request.
 */
async function graphqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  return withAutoReauth(async () => {
    const cookies = await getSessionCookies();
    const url = `${AFFINE_BASE_URL}${GRAPHQL_PATH}`;

    const response = await axios.post(
      url,
      { query, variables },
      {
        timeout: API_TIMEOUT,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Cookie: cookies,
        },
      }
    );

    if (response.data.errors?.length) {
      const errMsg = response.data.errors
        .map((e: { message: string }) => e.message)
        .join("; ");
      throw new Error(`GraphQL error: ${errMsg}`);
    }

    return response.data.data as T;
  });
}

// ─── User Operations ────────────────────────────────────────────────────────

interface CurrentUserResult {
  currentUser: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  } | null;
}

/**
 * Get the currently authenticated user.
 */
export async function getCurrentUser(): Promise<CurrentUserResult["currentUser"]> {
  const result = await graphqlRequest<CurrentUserResult>(`
    query {
      currentUser {
        id
        name
        email
        avatarUrl
      }
    }
  `);
  return result.currentUser;
}

// ─── Comment Operations ─────────────────────────────────────────────────────

interface DocCommentsResult {
  workspace: {
    doc: {
      comments: Array<{
        id: string;
        content: unknown;
        createdAt: string;
        author: {
          id: string;
          name: string;
        };
        resolved: boolean;
      }>;
    };
  };
}

/**
 * List comments on a document.
 */
export async function listComments(docId: string): Promise<CommentData[]> {
  // Try the workspace doc comments query
  try {
    const result = await graphqlRequest<DocCommentsResult>(
      `query($workspaceId: String!, $docId: String!) {
        workspace(id: $workspaceId) {
          doc(docId: $docId) {
            comments {
              id
              content
              createdAt
              author {
                id
                name
              }
              resolved
            }
          }
        }
      }`,
      { workspaceId: AFFINE_WORKSPACE_ID, docId }
    );

    return (result.workspace?.doc?.comments || []).map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      userId: c.author?.id,
      resolved: c.resolved,
    }));
  } catch {
    // If the schema doesn't match, try an alternative query shape
    console.error("Warning: Comment listing may need schema adjustment for this AFFiNE version");
    return [];
  }
}

interface CreateCommentResult {
  createComment: {
    id: string;
    content: unknown;
    createdAt: string;
  };
}

/**
 * Create a document-level comment.
 * Uses the BlockSuite JSON format for comment content.
 */
export async function createComment(
  docId: string,
  text: string,
  docTitle?: string
): Promise<{ id: string }> {
  const contentJson = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };

  const result = await graphqlRequest<CreateCommentResult>(
    `mutation($input: CommentCreateInput!) {
      createComment(input: $input) {
        id
        content
        createdAt
      }
    }`,
    {
      input: {
        docId,
        docMode: "page",
        docTitle: docTitle || "",
        workspaceId: AFFINE_WORKSPACE_ID,
        content: contentJson,
      },
    }
  );

  return { id: result.createComment.id };
}

interface ResolveCommentResult {
  resolveComment: {
    id: string;
  };
}

/**
 * Mark a comment as resolved.
 */
export async function resolveComment(commentId: string): Promise<void> {
  await graphqlRequest<ResolveCommentResult>(
    `mutation($input: CommentResolveInput!) {
      resolveComment(input: $input) {
        id
      }
    }`,
    { input: { id: commentId, resolved: true } }
  );
}

/**
 * Delete a comment.
 */
export async function deleteComment(commentId: string): Promise<void> {
  await graphqlRequest<{ deleteComment: boolean }>(
    `mutation($id: String!) {
      deleteComment(id: $id)
    }`,
    { id: commentId }
  );
}
