import { IconButton } from '@affine/component/ui/button';
import { PlusIcon } from '@blocksuite/icons/rc';
import type { ReactElement } from 'react';

export const AddCollectionButton = ({
  node,
  onClick,
}: {
  node: ReactElement | null;
  onClick: () => void;
}) => {
  return (
    <>
      <IconButton
        data-testid="slider-bar-add-collection-button"
        onClick={onClick}
        size="small"
      >
        <PlusIcon />
      </IconButton>
      {node}
    </>
  );
};
