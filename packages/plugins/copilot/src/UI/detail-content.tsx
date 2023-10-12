import { SendIcon } from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { useAtomValue, useSetAtom } from 'jotai';
import type { ReactElement } from 'react';
import { Suspense, useCallback, useState } from 'react';

import { ConversationList } from '../core/components/conversation-list';
import { FollowingUp } from '../core/components/following-up';
import { openAIApiKeyAtom, useChatAtoms } from '../core/hooks';
import {
  detailContentActionsStyle,
  detailContentStyle,
  sendButtonStyle,
  textareaStyle,
} from './index.css';

const Actions = () => {
  const { conversationAtom, followingUpAtoms } = useChatAtoms();
  const call = useSetAtom(conversationAtom);
  const questions = useAtomValue(followingUpAtoms.questionsAtom);
  const generateFollowingUp = useSetAtom(followingUpAtoms.generateChatAtom);
  const [input, setInput] = useState('');
  return (
    <>
      <FollowingUp questions={questions} />
      <div className={detailContentActionsStyle}>
        <textarea
          className={textareaStyle}
          value={input}
          placeholder="Type here ask Copilot some thing..."
          onChange={e => {
            setInput(e.target.value);
          }}
        />
        <IconButton
          className={sendButtonStyle}
          onClick={useCallback(() => {
            call(input)
              .then(() => generateFollowingUp())
              .catch(e => {
                console.error(e);
              });
          }, [call, generateFollowingUp, input])}
        >
          <SendIcon />
        </IconButton>
      </div>
    </>
  );
};

const DetailContentImpl = () => {
  const { conversationAtom } = useChatAtoms();
  const conversations = useAtomValue(conversationAtom);

  return (
    <div className={detailContentStyle}>
      <ConversationList conversations={conversations} />
      <Suspense fallback="generating follow-up question">
        <Actions />
      </Suspense>
    </div>
  );
};

export const DetailContent = (): ReactElement => {
  const key = useAtomValue(openAIApiKeyAtom);
  if (!key) {
    return <span>Please set OpenAI API Key in the debug panel.</span>;
  }
  return <DetailContentImpl />;
};
