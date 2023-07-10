import { Button, IconButton } from '@affine/component';
import { SendIcon } from '@blocksuite/icons';
import { rootStore } from '@toeverything/plugin-infra/manager';
import type { PluginUIAdapter } from '@toeverything/plugin-infra/type';
import { Provider, useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { ReactElement } from 'react';
import { StrictMode, Suspense, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { ConversationList } from '../core/components/conversation-list';
import { FollowingUp } from '../core/components/following-up';
import { SlashMenuActions } from '../core/components/slash-menu';
import { isAskingAtom, openAIApiKeyAtom, useChatAtoms } from '../core/hooks';
import {
  detailContentActionsStyle,
  detailContentStyle,
  sendButtonStyle,
  textareaStyle,
} from './index.css';

if (typeof window !== 'undefined') {
  import('@blocksuite/blocks')
    .then(({ FormatQuickBar }) => {
      FormatQuickBar.customElements = [];
      FormatQuickBar.customElements.push((_page, getSelection) => {
        const div = document.createElement('div');
        const root = createRoot(div);
        const AskAI = (): ReactElement => {
          const { conversationAtom } = useChatAtoms();
          const call = useSetAtom(conversationAtom);
          const onClickAskAI = useCallback(() => {
            const selection = getSelection();
            if (selection != null) {
              const text = selection.models
                .map(model => {
                  return model.text?.toString();
                })
                .filter((v): v is string => Boolean(v))
                .join('\n');
              console.log('selected text:', text);
              call(
                `I selected some text from the document: \n"${text}."`
              ).catch(err => {
                console.error(err);
              });
            }
          }, [call]);

          return (
            <div onClick={onClickAskAI} style={{ cursor: 'pointer' }}>
              Ask AI
            </div>
          );
        };
        root.render(
          <StrictMode>
            <Provider store={rootStore}>
              <AskAI />
            </Provider>
          </StrictMode>
        );
        return div;
      });
    })
    .catch(error => {
      console.error(error);
    });

  // TODO: await blocksuite get fixed
  // import('@blocksuite/blocks')
  //   .then(({ SlashMenu }) => {
  //     // console.log(getPageBlock(SlashMenu))
  //   })
  //   .catch(error => {
  //     console.error(error);
  //   });
}

const Actions = () => {
  const { conversationAtom, followingUpAtoms } = useChatAtoms();
  const call = useSetAtom(conversationAtom);
  const questions = useAtomValue(followingUpAtoms.questionsAtom);
  const generateFollowingUp = useSetAtom(followingUpAtoms.generateChatAtom);
  const [input, setInput] = useState('');
  const [isAsking, setIsasking] = useAtom(isAskingAtom);
  const abortClickHandler = () => {
    const controller = new AbortController();
    controller.abort();
  };
  return (
    <>
      {isAsking ? (
        <Button style={{ marginBottom: '12px' }} onClick={abortClickHandler}>
          Stop generating
        </Button>
      ) : (
        <Suspense fallback="generating follow-up question">
          <FollowingUp questions={questions} />
        </Suspense>
      )}
      <div className={detailContentActionsStyle}>
        <textarea
          className={textareaStyle}
          value={input}
          placeholder="Type here ask Copilot something..."
          onChange={e => {
            setInput(e.target.value);
          }}
        />
        <IconButton
          className={sendButtonStyle}
          onClick={useCallback(async () => {
            setIsasking(true);
            await call(input);
            await generateFollowingUp();
            setIsasking(false);
          }, [call, generateFollowingUp, input, setIsasking])}
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
        <SlashMenuActions />
      </Suspense>
    </div>
  );
};

export const DetailContent: PluginUIAdapter['detailContent'] = ({
  contentLayoutAtom,
}): ReactElement => {
  const layout = useAtomValue(contentLayoutAtom);
  const key = useAtomValue(openAIApiKeyAtom);
  if (layout === 'editor' || layout.second !== 'com.affine.copilot') {
    return <></>;
  }
  if (!key) {
    return <span>Please set OpenAI API Key in the debug panel.</span>;
  }
  return <DetailContentImpl />;
};
