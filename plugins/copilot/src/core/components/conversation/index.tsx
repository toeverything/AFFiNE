import { Button } from '@affine/component';
import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import { PlusIcon, ResetIcon } from '@blocksuite/icons';
import { currentPageAtom } from '@toeverything/plugin-infra/manager';
import { clsx } from 'clsx';
import { useAtom, useAtomValue } from 'jotai';
import type { BaseChatMessage, MessageType } from 'langchain/schema';
import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import { mangle } from 'marked-mangle';
import { type ReactElement, useMemo } from 'react';

import { useChatAtoms } from '../../hooks';
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
  const [currentPage] = useAtom(currentPageAtom);
  const { conversationAtom } = useChatAtoms();
  const conversations = useAtomValue(conversationAtom);
  return (
    <div
      className={clsx(styles.containerStyle, {
        [styles.avatarRightStyle]: props.type === 'human',
      })}
    >
      <WorkspaceAvatar workspace={null} />
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
              onClick={() => {
                const frameId =
                  currentPage?.getBlockByFlavour('affine:note')[0].id;
                currentPage?.addBlock(
                  'affine:paragraph',
                  {
                    text: new currentPage.Text(props.text),
                  },
                  frameId
                );
              }}
            >
              Insert list block only
            </Button>
            <Button
              icon={<PlusIcon />}
              size="small"
              className={styles.insertButtonStyle}
              hoverColor="var(--affine-text-primary-color)"
              onClick={() => {
                const frameId =
                  currentPage?.getBlockByFlavour('affine:note')[0].id;
                conversations.forEach((conversation: BaseChatMessage) => {
                  currentPage?.addBlock(
                    'affine:paragraph',
                    {
                      text: new currentPage.Text(conversation.text),
                    },
                    frameId
                  );
                });
              }}
            >
              Insert all
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
