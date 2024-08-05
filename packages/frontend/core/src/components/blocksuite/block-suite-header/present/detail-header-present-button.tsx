import { IconButton } from '@affine/component';
import { PresentationIcon } from '@blocksuite/icons/rc';

import { usePresent } from './use-present';

export const DetailPageHeaderPresentButton = () => {
  const { isPresent, handlePresent } = usePresent();

  return (
    <IconButton
      style={{ flexShrink: 0 }}
      size="24"
      onClick={() => handlePresent(!isPresent)}
    >
      <PresentationIcon />
    </IconButton>
  );
};
