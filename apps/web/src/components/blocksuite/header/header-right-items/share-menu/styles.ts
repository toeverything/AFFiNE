import { displayFlex, styled } from '@affine/component';

export const StyledTabsWrapper = styled('div')(({ theme }) => {
  return {
    ...displayFlex('space-around', 'center'),
  };
});
