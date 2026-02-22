/**
 * AFFiNE MCP Server - Zod Input Schemas
 *
 * All tool input validation schemas in one place.
 */

import { z } from "zod";

// ─── Shared Enums ───────────────────────────────────────────────────────────

export const ResponseFormatSchema = z
  .enum(["markdown", "json"])
  .default("markdown")
  .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable");

// ─── Document Schemas ───────────────────────────────────────────────────────

export const ListDocsInputSchema = z
  .object({
    response_format: ResponseFormatSchema,
  })
  .strict();

export const CreateDocInputSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .max(500, "Title must not exceed 500 characters")
      .describe("Title for the new document"),
    markdown: z
      .string()
      .optional()
      .describe("Optional markdown content to populate the document with"),
    response_format: ResponseFormatSchema,
  })
  .strict();

export const ReadDocInputSchema = z
  .object({
    docId: z
      .string()
      .min(1, "docId is required")
      .describe("The document ID to read"),
    response_format: ResponseFormatSchema,
  })
  .strict();

export const EditDocInputSchema = z
  .object({
    docId: z
      .string()
      .min(1, "docId is required")
      .describe("The document ID to edit"),
    operations: z
      .array(
        z
          .object({
            action: z
              .enum(["append", "update", "delete"])
              .describe("The edit action to perform"),
            blockType: z
              .string()
              .optional()
              .describe(
                "Block type for append: 'paragraph', 'list', 'code', 'divider'. For paragraph, use propType for heading/quote."
              ),
            propType: z
              .string()
              .optional()
              .describe(
                "Property type: 'text', 'h1'-'h6', 'quote' for paragraph; 'bulleted', 'numbered', 'todo' for list"
              ),
            content: z
              .string()
              .optional()
              .describe("Text content (supports inline markdown formatting)"),
            blockId: z
              .string()
              .optional()
              .describe("Block ID (required for update and delete actions)"),
          })
          .strict()
      )
      .min(1, "At least one operation is required")
      .describe("Array of edit operations to apply sequentially"),
    response_format: ResponseFormatSchema,
  })
  .strict();

export const DeleteDocInputSchema = z
  .object({
    docId: z
      .string()
      .min(1, "docId is required")
      .describe("The document ID to delete (moves to trash)"),
  })
  .strict();

// ─── Collection Schemas ─────────────────────────────────────────────────────

export const ListCollectionsInputSchema = z
  .object({
    response_format: ResponseFormatSchema,
  })
  .strict();

export const CreateCollectionInputSchema = z
  .object({
    name: z
      .string()
      .min(1, "Collection name is required")
      .max(200, "Collection name must not exceed 200 characters")
      .describe("Name for the new collection"),
    docIds: z
      .array(z.string())
      .optional()
      .describe("Optional list of document IDs to include in the collection"),
    response_format: ResponseFormatSchema,
  })
  .strict();

export const UpdateCollectionInputSchema = z
  .object({
    collectionId: z
      .string()
      .min(1, "collectionId is required")
      .describe("The collection ID to update"),
    name: z
      .string()
      .optional()
      .describe("New name for the collection"),
    addDocIds: z
      .array(z.string())
      .optional()
      .describe("Document IDs to add to the collection"),
    removeDocIds: z
      .array(z.string())
      .optional()
      .describe("Document IDs to remove from the collection"),
    response_format: ResponseFormatSchema,
  })
  .strict();

export const DeleteCollectionInputSchema = z
  .object({
    collectionId: z
      .string()
      .min(1, "collectionId is required")
      .describe("The collection ID to delete (does not delete documents)"),
  })
  .strict();

// ─── Comment Schemas ────────────────────────────────────────────────────────

export const ListCommentsInputSchema = z
  .object({
    docId: z
      .string()
      .min(1, "docId is required")
      .describe("The document ID to list comments for"),
    response_format: ResponseFormatSchema,
  })
  .strict();

export const CreateCommentInputSchema = z
  .object({
    docId: z
      .string()
      .min(1, "docId is required")
      .describe("The document ID to comment on"),
    content: z
      .string()
      .min(1, "Comment content is required")
      .max(5000, "Comment must not exceed 5000 characters")
      .describe("The comment text"),
    response_format: ResponseFormatSchema,
  })
  .strict();

export const ResolveCommentInputSchema = z
  .object({
    commentId: z
      .string()
      .min(1, "commentId is required")
      .describe("The comment ID to mark as resolved"),
  })
  .strict();

export const DeleteCommentInputSchema = z
  .object({
    commentId: z
      .string()
      .min(1, "commentId is required")
      .describe("The comment ID to delete"),
  })
  .strict();

// ─── Utility Schemas ────────────────────────────────────────────────────────

export const SearchInputSchema = z
  .object({
    query: z
      .string()
      .min(1, "Search query is required")
      .max(500, "Query must not exceed 500 characters")
      .describe("Search query to match against document content"),
    response_format: ResponseFormatSchema,
  })
  .strict();

export const CurrentUserInputSchema = z
  .object({
    response_format: ResponseFormatSchema,
  })
  .strict();

// ─── Type Exports ───────────────────────────────────────────────────────────

export type ListDocsInput = z.infer<typeof ListDocsInputSchema>;
export type CreateDocInput = z.infer<typeof CreateDocInputSchema>;
export type ReadDocInput = z.infer<typeof ReadDocInputSchema>;
export type EditDocInput = z.infer<typeof EditDocInputSchema>;
export type DeleteDocInput = z.infer<typeof DeleteDocInputSchema>;
export type ListCollectionsInput = z.infer<typeof ListCollectionsInputSchema>;
export type CreateCollectionInput = z.infer<typeof CreateCollectionInputSchema>;
export type UpdateCollectionInput = z.infer<typeof UpdateCollectionInputSchema>;
export type DeleteCollectionInput = z.infer<typeof DeleteCollectionInputSchema>;
export type ListCommentsInput = z.infer<typeof ListCommentsInputSchema>;
export type CreateCommentInput = z.infer<typeof CreateCommentInputSchema>;
export type ResolveCommentInput = z.infer<typeof ResolveCommentInputSchema>;
export type DeleteCommentInput = z.infer<typeof DeleteCommentInputSchema>;
export type SearchInput = z.infer<typeof SearchInputSchema>;
export type CurrentUserInput = z.infer<typeof CurrentUserInputSchema>;
