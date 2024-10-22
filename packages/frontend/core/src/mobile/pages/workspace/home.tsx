import { SafeArea, useThemeColorV2 } from '@affine/component';

import { AppTabs } from '../../components';
import {
  ExplorerCollections,
  ExplorerFavorites,
  ExplorerOrganize,
  ExplorerTags,
} from '../../components/explorer';
import { HomeHeader, RecentDocs } from '../../views';

export const Component = () => {
  useThemeColorV2('layer/background/secondary');

  return (
    <>
      <HomeHeader />
      <RecentDocs />
      <SafeArea bottom>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 32,
            padding: '0 8px 32px 8px',
          }}
        >
          <ExplorerFavorites />
          <ExplorerOrganize />
          <ExplorerCollections />
          <ExplorerTags />
        </div>
      </SafeArea>
      <AppTabs />
    </>
  );
};
