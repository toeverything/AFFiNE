import { Button } from '@affine/component';
import { PlusIcon, ResetIcon } from '@blocksuite/icons';
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
      <div className={styles.conversationContainerStyle}>
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
        {props.type === 'ai' ? (
          <div className={styles.insertButtonsStyle}>
            <Button
              icon={<PlusIcon />}
              size="small"
              className={styles.insertButtonStyle}
              hoverColor="var(--affine-text-primary-color)"
            >
              Insert list block only
            </Button>
            <Button
              icon={<PlusIcon />}
              size="small"
              className={styles.insertButtonStyle}
              hoverColor="var(--affine-text-primary-color)"
            >
              Insert all
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
