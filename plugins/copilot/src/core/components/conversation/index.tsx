import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import { ResetIcon } from '@blocksuite/icons';
import { clsx } from 'clsx';
import type { MessageType } from 'langchain/schema';
import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import { mangle } from 'marked-mangle';
import { type ReactElement, useMemo } from 'react';

import * as styles from './index.css';

marked.use(
  gfmHeadingId({
    prefix: 'affine-',
  })
);

marked.use(mangle());

export interface ConversationProps {
  type: MessageType;
  text: string;
}

export const Conversation = (props: ConversationProps): ReactElement => {
  const html = useMemo(() => marked.parse(props.text), [props.text]);
  return (
    <div
      className={clsx(styles.containerStyle, {
        [styles.avatarRightStyle]: props.type === 'human',
      })}
    >
      <WorkspaceAvatar workspace={null} />
      <div
        className={clsx(styles.conversationStyle, {
          [styles.aiMessageStyle]: props.type === 'ai',
          [styles.humanMessageStyle]: props.type === 'human',
        })}
      >
        {props.type === 'ai' ? (
          <div className={styles.regenerateButtonStyle}>
            <div className={styles.resetIconStyle}>
              <ResetIcon />
            </div>
            Regenerate
          </div>
        ) : null}
        <div
          dangerouslySetInnerHTML={{
            __html: html,
          }}
        ></div>
      </div>
    </div>
  );
};
