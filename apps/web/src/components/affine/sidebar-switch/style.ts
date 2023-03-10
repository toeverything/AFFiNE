import { IconButton, styled } from '@affine/component';

export const StyledSidebarSwitch = styled(IconButton)<{ visible: boolean }>(
  ({ visible }) => {
    return {
      opacity: visible ? 1 : 0,
      transition: 'all 0.2s ease-in-out',
    };
  }
);
