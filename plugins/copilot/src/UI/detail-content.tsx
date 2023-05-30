import { Button, Input } from '@affine/component';
import { rootStore } from '@affine/workspace/atom';
import type { PluginUIAdapter } from '@toeverything/plugin-infra/type';
import { Provider, useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { ReactElement } from 'react';
import { Fragment, StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Conversation } from '../core/components/conversation';
import { Divider } from '../core/components/divider';
import { openAIApiKeyAtom, useChatAtoms } from '../core/hooks';

if (!environment.isServer) {
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
  const { conversationAtom } = useChatAtoms();
  const [conversations, call] = useAtom(conversationAtom);
  return (
    <div
      style={{
        width: '300px',
      }}
    >
      {conversations.map((message, idx) => {
        return (
          <Fragment key={idx}>
            <Conversation text={message.text} />
            <Divider />
          </Fragment>
        );
      })}
      <div>
        <Input
          value={input}
          onChange={text => {
            setInput(text);
          }}
        />
        <Button
          onClick={() => {
            void call(input);
          }}
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
