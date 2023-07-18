import { Button, FlexWrapper, Input } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { SettingWrapper } from '@affine/component/setting-components';
import type { PluginUIAdapter } from '@toeverything/plugin-infra/type';
import { useAtom } from 'jotai';
import { useCallback } from 'react';

import { openAIApiKeyAtom } from '../core/hooks';
import { conversationHistoryDBName } from '../core/langchain/message-history';

export const DebugContent: PluginUIAdapter['debugContent'] = () => {
  const [key, setKey] = useAtom(openAIApiKeyAtom);
  const desc = (
    <>
      <span>You can get your API key from </span>
      <a
        target="_blank"
        rel="noreferrer"
        href="https://beta.openai.com/account/api-keys"
      >
        here.
      </a>
    </>
  );
  return (
    <div>
      <SettingWrapper title={'Ai Copilot'}>
        <SettingRow name={'openAI API key'} desc={desc}></SettingRow>
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
            size="middle"
            onClick={() => {
              indexedDB.deleteDatabase(conversationHistoryDBName);
              location.reload();
            }}
          >
            {'Clean conversations'}
          </Button>
        </FlexWrapper>
      </SettingWrapper>
    </div>
  );
};
