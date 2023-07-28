import { Button, FlexWrapper, Input } from '@affine/component';
import { useAtom } from 'jotai';
import { type ReactElement, useCallback } from 'react';

import { openAIApiKeyAtom } from '../core/hooks';
import { conversationHistoryDBName } from '../core/langchain/message-history';

export const DebugContent = (): ReactElement => {
  const [key, setKey] = useAtom(openAIApiKeyAtom);
  return (
    <div>
      <FlexWrapper justifyContent="space-between">
        <Input
          defaultValue={key ?? undefined}
          onChange={useCallback(
            (newValue: string) => {
              setKey(newValue);
            },
            [setKey]
          )}
        />
        <Button
          size="large"
          onClick={() => {
            indexedDB.deleteDatabase(conversationHistoryDBName);
            location.reload();
          }}
        >
          {'Clean conversations'}
        </Button>
      </FlexWrapper>
    </div>
  );
};
