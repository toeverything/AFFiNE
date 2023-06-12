import { Button, Input } from '@affine/component';
import { rootStore } from '@toeverything/plugin-infra/manager';
import type { PluginUIAdapter } from '@toeverything/plugin-infra/type';
import { Provider, useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { ReactElement } from 'react';
import { StrictMode, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { ConversationList } from '../core/components/conversation-list';
import { openAIApiKeyAtom, useChatAtoms } from '../core/hooks';
import { detailContentActionsStyle, detailContentStyle } from './index.css';

if (typeof window === 'undefined') {
  import('@blocksuite/blocks').then(({ FormatQuickBar }) => {
    FormatQuickBar.customElements.push((_page, getSelection) => {
      const div = document.createElement('div');
      const root = createRoot(div);

      const AskAI = (): ReactElement => {
        const { conversationAtom } = useChatAtoms();
        const call = useSetAtom(conversationAtom);

        return (
          <div
            onClick={() => {
              const selection = getSelection();
              if (selection != null) {
                const text = selection.models
                  .map(model => {
                    return model.text?.toString();
                  })
                  .filter((v): v is string => Boolean(v))
                  .join('\n');
                console.log('selected text:', text);
                void call(
                  `I selected some text from the document: \n"${text}."`
                );
              }
            }}
          >
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
  });
}

const DetailContentImpl = () => {
  const [input, setInput] = useState('');
  const { conversationAtom, followupAtom } = useChatAtoms();
  const [conversations, call] = useAtom(conversationAtom);
  const generateFollowup = useSetAtom(followupAtom);
  const [following, setFollowing] = useState<string[] | null>(null);
  const followup = following && (
    <div>
      {following.map((following, idx) => (
        <div key={idx}>{following}</div>
      ))}
    </div>
  );
  return (
    <div className={detailContentStyle}>
      <ConversationList conversations={conversations} />
      {followup}
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
            setFollowing(await generateFollowup());
          }, [call, generateFollowup, input])}
        >
          send
        </Button>
      </div>
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
