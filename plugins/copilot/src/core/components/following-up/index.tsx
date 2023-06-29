import type { ReactElement } from 'react';

import { followingUpStyle, questionStyle } from './index.css';

export type FollowingUpProps = {
  questions: string[];
};

export const FollowingUp = (props: FollowingUpProps): ReactElement => {
  return (
    <div className={followingUpStyle}>
      {props.questions.map((question, index) => (
        <div className={questionStyle} key={index}>
          {question}
        </div>
      ))}
    </div>
  );
};
