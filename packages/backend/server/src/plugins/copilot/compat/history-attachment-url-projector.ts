import { Injectable } from '@nestjs/common';

import { promptAttachmentToUrl } from '../providers/utils';
import type { ChatMessage } from '../types';

@Injectable()
export class HistoryAttachmentUrlProjector {
  projectMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map(message => ({
      ...message,
      attachments: message.attachments
        ?.map(attachment => promptAttachmentToUrl(attachment))
        .filter((attachment): attachment is string => !!attachment),
    }));
  }
}
