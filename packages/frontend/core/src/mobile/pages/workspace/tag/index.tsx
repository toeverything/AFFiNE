import { useThemeColorV2 } from '@affine/component';

import { AllDocsHeader, TagList } from '../../../views';

export const Component = () => {
  useThemeColorV2('layer/background/mobile/primary');
  return (
    <>
      <AllDocsHeader />
      <TagList />
    </>
  );
};
