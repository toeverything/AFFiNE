import { Button, Input } from '@affine/component';
import type { PluginUIAdapter } from '@toeverything/plugin-infra/type';
import { useAtom } from 'jotai';
import { useCallback } from 'react';

import { openAIApiKeyAtom } from '../core/hooks';
import { conversationHistoryDBName } from '../core/langchain/message-history';

export const DebugContent: PluginUIAdapter['debugContent'] = () => {
  const [key, setKey] = useAtom(openAIApiKeyAtom);
  return (
    <div>
      <span>OpenAI API Key:</span>
      <Input
        value={key ?? ''}
        onChange={useCallback(
          (newValue: string) => {
            setKey(newValue);
          },
          [setKey]
        )}
      />
      <Button
        onClick={() => {
          indexedDB.deleteDatabase(conversationHistoryDBName);
          location.reload();
        }}
      >
        Clean conversations
      </Button>
    </div>
  );
};
