/**
 * Comment Agent Job — handles @agent mentions in comments.
 *
 * When a user @mentions the agent user in a comment or reply,
 * this job handler:
 *   1. Fetches the document content for context
 *   2. Sends comment text + doc context to Claude Code
 *   3. Creates a reply as the agent user
 */
import { Injectable, Logger } from '@nestjs/common';

import { OnJob } from '../../base';
import { Models } from '../../models';
import { DocReader } from '../../core/doc/reader';
import { ClaudeCodeAdapter } from './llm/claude-code.adapter';

// Declare the job type
declare global {
  interface Jobs {
    'agent.commentMention': {
      commentId: string;
      replyId?: string;
      workspaceId: string;
      docId: string;
      senderUserId: string;
      mentionContent: string;
    };
  }
}

/** Well-known agent user ID — set via AGENT_USER_ID env var */
export const AGENT_USER_ID = process.env.AGENT_USER_ID ?? '__aion_agent__';

@Injectable()
export class CommentAgentJob {
  private readonly logger = new Logger(CommentAgentJob.name);

  constructor(
    private readonly models: Models,
    private readonly claudeCode: ClaudeCodeAdapter,
    private readonly docReader: DocReader
  ) {}

  @OnJob('agent.commentMention')
  async handleAgentMention(payload: Jobs['agent.commentMention']) {
    const { commentId, replyId, workspaceId, docId, senderUserId, mentionContent } = payload;

    this.logger.log(
      `Agent mentioned in comment ${commentId}${replyId ? ` (reply ${replyId})` : ''} ` +
      `by user ${senderUserId} in doc ${docId}`
    );

    try {
      // Fetch document content for context
      let docContext = '';
      try {
        const docMarkdown = await this.docReader.getDocMarkdown(workspaceId, docId, false);
        if (docMarkdown?.markdown) {
          docContext = docMarkdown.markdown;
        } else {
          const docContent = await this.docReader.getDocContent(workspaceId, docId);
          if (docContent) {
            docContext = `Title: ${docContent.title}\n${docContent.summary}`;
          }
        }
      } catch (err) {
        this.logger.warn(`Could not fetch doc content for ${docId}: ${(err as Error).message}`);
      }

      // Build prompt with document context
      const prompt = docContext
        ? (
          `You are an AI assistant embedded in a collaborative document editor (AFFiNE/AION).\n` +
          `A user mentioned you in a comment on this document.\n\n` +
          `--- DOCUMENT CONTENT ---\n${docContext}\n--- END DOCUMENT ---\n\n` +
          `User's comment: ${mentionContent}`
        )
        : (
          `You are an AI assistant embedded in a collaborative document editor (AFFiNE/AION).\n` +
          `A user mentioned you in a comment.\n\n` +
          `User's comment: ${mentionContent}`
        );

      // Generate a response using Claude Code
      const response = await this.claudeCode.chat(prompt, {
        model: process.env.AGENT_MODEL,
        timeoutMs: 120_000, // 2 min for comment replies
      });

      const replyText = response.text || 'I was unable to generate a response. Please try again.';

      // Build a minimal BlockSuite-compatible snapshot for the reply content
      const replyContent = buildReplySnapshot(replyText);

      // Create a reply as the agent user
      await this.models.comment.createReply({
        commentId,
        userId: AGENT_USER_ID,
        content: replyContent,
      });

      this.logger.log(`Agent replied to comment ${commentId} successfully`);
    } catch (err) {
      this.logger.error(
        `Failed to handle agent mention in comment ${commentId}: ${(err as Error).message}`
      );

      // Post an error reply so the user knows something went wrong
      try {
        const errorContent = buildReplySnapshot(
          `Sorry, I encountered an error processing your request: ${(err as Error).message}`
        );
        await this.models.comment.createReply({
          commentId,
          userId: AGENT_USER_ID,
          content: errorContent,
        });
      } catch {
        this.logger.error('Failed to post error reply to comment');
      }
    }
  }
}

/**
 * Build a minimal BlockSuite-compatible snapshot for a text reply.
 */
function buildReplySnapshot(text: string): Record<string, any> {
  return {
    snapshot: {
      type: 'block',
      id: 'agent-reply',
      flavour: 'affine:page',
      children: [
        {
          type: 'block',
          id: 'agent-reply-paragraph',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              delta: [{ insert: text }],
            },
          },
          children: [],
        },
      ],
    },
  };
}
