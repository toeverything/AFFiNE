import { styled } from '@affine/component';

export const StyledSidebarSwitch = styled('button')<{ visible: boolean }>(
  ({ theme, visible }) => {
    return {
      display: 'inline-flex',
      justifyContent: 'center',
      alignItems: 'center',
      color: theme.colors.innerHoverBackground,
      width: '32px',
      height: '32px',
      borderRadius: '8px',
      opacity: visible ? 1 : 0,
      transition: 'all 0.2s ease-in-out',
      ...(visible ? {} : { cursor: 'not-allowed', pointerEvents: 'none' }),

      ':hover': {
        background: '#F1F1F4',
        color: theme.colors.iconColor,
      },
    };
  }
);
