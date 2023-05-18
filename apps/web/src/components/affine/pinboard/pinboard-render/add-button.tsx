import { PlusIcon } from '@blocksuite/icons';

import { StyledOperationButton } from '../styles';
import type { OperationButtonProps } from './operation-button';

export const AddButton = ({
  onAdd,
  visible,
}: Pick<OperationButtonProps, 'onAdd' | 'visible'>) => {
  return (
    <StyledOperationButton
      visible={visible}
      size="small"
      onClick={e => {
        e.stopPropagation();
        onAdd();
      }}
    >
      <PlusIcon />
    </StyledOperationButton>
  );
};
