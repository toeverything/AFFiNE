import { AppContainer, MainContainer } from '@affine/component/workspace';
import { config } from '@affine/env';
import { NoSsr } from '@mui/material';
import { affinePluginsAtom } from '@toeverything/plugin-infra/manager';
import { useAtomValue } from 'jotai';
import type { ReactElement } from 'react';
import { Suspense } from 'react';

const Plugins = () => {
  const plugins = useAtomValue(affinePluginsAtom);
  return (
    <NoSsr>
      <div>
        {Object.values(plugins).map(({ definition, uiAdapter }) => {
          const Content = uiAdapter.debugContent;
          return (
            <div key={definition.id}>
              {/* todo: support i18n */}
              {definition.name.fallback}
              {Content && <Content />}
            </div>
          );
        })}
      </div>
    </NoSsr>
  );
};

export default function PluginPage(): ReactElement {
  if (!config.enablePlugin) {
    return <></>;
  }
  return (
    <AppContainer>
      <MainContainer>
        <Suspense>
          <Plugins />
        </Suspense>
      </MainContainer>
    </AppContainer>
  );
}
