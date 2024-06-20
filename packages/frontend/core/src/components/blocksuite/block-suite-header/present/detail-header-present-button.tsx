import { IconButton } from '@affine/component';
import { PresentationIcon } from '@blocksuite/icons/rc';

import { usePresent } from './use-present';

export const DetailPageHeaderPresentButton = () => {
  const { isPresent, handlePresent } = usePresent();

  return (
    <IconButton
      style={{ flexShrink: 0 }}
      size={'large'}
      icon={<PresentationIcon />}
      onClick={() => handlePresent(!isPresent)}
    ></IconButton>
  );
};
