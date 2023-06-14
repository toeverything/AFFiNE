import { Button, Input } from '@affine/component';
import { rootStore } from '@toeverything/plugin-infra/manager';
import type { PluginUIAdapter } from '@toeverything/plugin-infra/type';
import { Provider, useAtomValue, useSetAtom } from 'jotai';
import type { ReactElement } from 'react';
import { StrictMode, Suspense, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { ConversationList } from '../core/components/conversation-list';
import { FollowingUp } from '../core/components/following-up';
import { openAIApiKeyAtom, useChatAtoms } from '../core/hooks';
import { detailContentActionsStyle, detailContentStyle } from './index.css';

if (typeof window === 'undefined') {
  import('@blocksuite/blocks')
    .then(({ FormatQuickBar }) => {
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

          return <div onClick={onClickAskAI}>Ask AI</div>;
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
}

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
        <Input
          value={input}
          onChange={text => {
            setInput(text);
          }}
        />
        <Button
          onClick={useCallback(async () => {
            await call(input);
            await generateFollowingUp();
          }, [call, generateFollowingUp, input])}
        >
          send
        </Button>
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
