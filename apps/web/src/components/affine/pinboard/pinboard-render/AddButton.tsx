import { PlusIcon } from '@blocksuite/icons';

import { StyledOperationButton } from '../styles';
import type { OperationButtonProps } from './OperationButton';

export const AddButton = ({
  onAdd,
  visible,
}: Pick<OperationButtonProps, 'onAdd' | 'visible'>) => {
  return (
    <StyledOperationButton
      visible={visible}
      size="small"
      onClick={() => {
        onAdd();
      }}
    >
      <PlusIcon />
    </StyledOperationButton>
  );
};
