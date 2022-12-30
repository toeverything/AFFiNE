import { styled } from '@/styles';

export const StyledInput = styled('input')<{
  disabled?: boolean;
  value?: string;
  width: number;
}>(({ theme, width, disabled }) => {
  const fontWeight = 400;
  const fontSize = '16px';
  return {
    width: `${width}px`,
    lineHeight: '22px',
    padding: '8px 12px',
    fontWeight,
    fontSize,
    color: disabled ? theme.colors.disableColor : theme.colors.inputColor,
    border: `1px solid`,
    borderColor: theme.colors.borderColor, // TODO: check out disableColor,
    backgroundColor: theme.colors.popoverBackground,
    borderRadius: '10px',
    '&::placeholder': {
      fontWeight,
      fontSize,
      color: theme.colors.placeHolderColor,
    },
    '&:focus': {
      borderColor: theme.colors.primaryColor,
    },
  };
});
