import { useAtom, useSetAtom } from 'jotai';
import type { ReactElement } from 'react';

import { isAskingAtom, useChatAtoms } from '../../hooks';
import { followingUpStyle, questionStyle } from './index.css';

export type FollowingUpProps = {
  questions: string[];
};

export const FollowingUp = (props: FollowingUpProps): ReactElement => {
  const { conversationAtom, followingUpAtoms } = useChatAtoms();
  const call = useSetAtom(conversationAtom);
  const generateFollowingUp = useSetAtom(followingUpAtoms.generateChatAtom);
  const [isAsking, setIsasking] = useAtom(isAskingAtom);

  const handleClick = async (question: string) => {
    if (!isAsking) {
      setIsasking(true);
      await call(question);
      await generateFollowingUp();
      setIsasking(false);
    }
  };
  return (
    <div className={followingUpStyle}>
      {props.questions.map((question, index) => (
        <div
          className={questionStyle}
          key={index}
          onClick={() => handleClick(question)}
        >
          {question}
        </div>
      ))}
    </div>
  );
};
