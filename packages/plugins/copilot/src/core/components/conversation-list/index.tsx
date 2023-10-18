import type { BaseMessage } from 'langchain/schema';

import { Conversation } from '../conversation';
import { conversationListStyle } from './index.css';

export type ConversationListProps = {
  conversations: BaseMessage[];
};

export const ConversationList = (props: ConversationListProps) => {
  return (
    <div className={conversationListStyle}>
      {props.conversations.map((conversation, idx) => (
        <Conversation
          type={conversation._getType()}
          text={conversation.content}
          key={idx}
        />
      ))}
    </div>
  );
};
