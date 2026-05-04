import { Injectable } from '@nestjs/common';

import { type Turn, turnFromChatMessage } from '../../core';
import type { StreamObject } from '../../providers/types';
import { StreamObjectParser } from '../../providers/utils';

@Injectable()
export class ResponsePostprocessor {
  buildTextAssistantTurn(sessionId: string, content: string): Turn {
    return {
      conversationId: sessionId,
      role: 'assistant',
      content,
      attachments: [],
      renderTrace: [],
      toolEvents: [],
      metadata: {},
      createdAt: new Date(),
    };
  }

  buildObjectAssistantTurn(sessionId: string, chunks: StreamObject[]): Turn {
    const parser = new StreamObjectParser();
    const streamObjects = parser.mergeTextDelta(chunks);
    const content = parser.mergeContent(streamObjects);

    return turnFromChatMessage(
      {
        role: 'assistant',
        content,
        streamObjects,
        createdAt: new Date(),
      },
      sessionId
    );
  }

  buildImageAssistantTurn(sessionId: string, attachments: string[]): Turn {
    return {
      conversationId: sessionId,
      role: 'assistant',
      content: '',
      attachments,
      renderTrace: [],
      toolEvents: [],
      metadata: {},
      createdAt: new Date(),
    };
  }
}
