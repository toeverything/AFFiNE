import { useThemeColorV2 } from '@affine/component';

import { AppTabs } from '../../../components';
import { AllDocsHeader, CollectionList } from '../../../views';

export const Component = () => {
  useThemeColorV2('layer/background/secondary');
  return (
    <>
      <AllDocsHeader />
      <AppTabs />
      <CollectionList />
    </>
  );
};
