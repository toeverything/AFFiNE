import { displayFlex, styled, TextButton } from '@affine/component';

export const StyledTabsWrapper = styled('div')(({ theme }) => {
  return {
    ...displayFlex('space-around', 'center'),
  };
});

export const StyledShareButton = styled(TextButton)(({ theme }) => {
  return {
    padding: '4px 8px',
    marginLeft: '4px',
    marginRight: '16px',
    border: `1px solid ${theme.colors.primaryColor}`,
    color: theme.colors.primaryColor,
    borderRadius: '8px',
  };
});
