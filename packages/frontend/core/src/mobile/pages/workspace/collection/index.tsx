import { useThemeColorV2 } from '@affine/component';

import { AllDocsHeader, CollectionList } from '../../../views';

export const Component = () => {
  useThemeColorV2('layer/background/mobile/primary');
  return (
    <>
      <AllDocsHeader />
      <CollectionList />
    </>
  );
};
