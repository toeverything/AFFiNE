import { AppContainer, MainContainer } from '@affine/component/workspace';
import { affinePluginsAtom } from '@toeverything/plugin-infra/manager';
import { useAtomValue } from 'jotai';
import type { ReactElement } from 'react';

export default function PluginPage(): ReactElement {
  const plugins = useAtomValue(affinePluginsAtom);
  return (
    <AppContainer>
      <MainContainer>
        {Object.values(plugins).map(({ definition }) => {
          return (
            <div key={definition.id}>
              {/* todo: support i18n */}
              {definition.name.fallback}
            </div>
          );
        })}
      </MainContainer>
    </AppContainer>
  );
}
