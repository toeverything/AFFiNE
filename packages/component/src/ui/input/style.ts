import type { CSSProperties } from 'react';

import { styled } from '../../styles';

export const StyledInput = styled('input')<{
  disabled?: boolean;
  value?: string;
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  noBorder?: boolean;
}>(({ theme, width, disabled, height, noBorder }) => {
  return {
    width: width || '100%',
    height,
    lineHeight: '22px',
    padding: '8px 12px',
    color: disabled ? theme.colors.disableColor : theme.colors.textColor,
    border: noBorder ? 'unset' : `1px solid`,
    borderColor: theme.colors.borderColor, // TODO: check out disableColor,
    backgroundColor: theme.colors.popoverBackground,
    borderRadius: '10px',
    '&::placeholder': {
      color: theme.colors.placeHolderColor,
    },
    '&:focus': {
      borderColor: theme.colors.primaryColor,
    },
  };
});
