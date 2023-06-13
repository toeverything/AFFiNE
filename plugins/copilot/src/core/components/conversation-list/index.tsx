import type { BaseChatMessage } from 'langchain/schema';

import { Conversation } from '../conversation';
import { conversationListStyle } from './index.css';

export type ConversationListProps = {
  conversations: BaseChatMessage[];
};

export const ConversationList = (props: ConversationListProps) => {
  return (
    <div className={conversationListStyle}>
      {props.conversations.map((conversation, idx) => (
        <Conversation
          type={conversation._getType()}
          text={conversation.text}
          key={idx}
        />
      ))}
    </div>
  );
};
