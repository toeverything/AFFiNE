import { Injectable } from '@nestjs/common';

import type { Turn } from '../../core';
import type { StreamObject } from '../../providers/types';
import { ChatSession } from '../../session';
import { ConversationHost } from './conversation-host';
import { ResponsePostprocessor } from './response-postprocessor';

@Injectable()
export class TurnPersistence {
  constructor(
    private readonly conversations: ConversationHost,
    private readonly postprocessor: ResponsePostprocessor
  ) {}

  async persistTextResult(
    session: ChatSession,
    content: string,
    wasAborted: boolean
  ) {
    return await this.conversations.persistAssistantTurn(
      session,
      this.postprocessor.buildTextAssistantTurn(
        session.config.sessionId,
        content
      ),
      wasAborted
    );
  }

  async persistObjectResult(
    session: ChatSession,
    chunks: StreamObject[],
    wasAborted: boolean
  ) {
    return await this.conversations.persistAssistantTurn(
      session,
      this.postprocessor.buildObjectAssistantTurn(
        session.config.sessionId,
        chunks
      ),
      wasAborted
    );
  }

  async persistImageResult(
    session: ChatSession,
    attachments: string[],
    wasAborted: boolean
  ) {
    return await this.conversations.persistAssistantTurn(
      session,
      this.postprocessor.buildImageAssistantTurn(
        session.config.sessionId,
        attachments
      ),
      wasAborted
    );
  }

  async persistProjectedResult(
    session: ChatSession,
    turn: Turn,
    wasAborted: boolean
  ) {
    return await this.conversations.persistAssistantTurn(
      session,
      turn,
      wasAborted
    );
  }
}
