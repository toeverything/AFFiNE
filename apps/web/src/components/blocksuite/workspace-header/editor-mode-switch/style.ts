import { displayFlex, styled } from '@affine/component';

export const StyledEditorModeSwitch = styled('div')<{
  switchLeft: boolean;
  showAlone?: boolean;
}>(({ theme, switchLeft, showAlone }) => {
  const {
    palette: { mode },
  } = theme;
  return {
    width: showAlone ? '40px' : '78px',
    height: '32px',
    background: showAlone
      ? 'transparent'
      : mode === 'dark'
      ? '#242424'
      : '#F9F9FB',
    borderRadius: '12px',
    ...displayFlex('space-between', 'center'),
    padding: '0 8px',
    position: 'relative',

    '::after': {
      content: '""',
      display: showAlone ? 'none' : 'block',
      width: '24px',
      height: '24px',
      background: theme.colors.pageBackground,
      boxShadow:
        mode === 'dark'
          ? '0px 0px 6px rgba(22, 22, 22, 0.6)'
          : '0px 0px 6px #E2E2E2',
      borderRadius: '8px',
      zIndex: 1,
      position: 'absolute',
      transform: `translateX(${switchLeft ? '0' : '38px'})`,
      transition: 'all .15s',
    },
  };
});

export const StyledSwitchItem = styled('button')<{
  active?: boolean;
  hide?: boolean;
}>(({ theme, active = false, hide = false }) => {
  return {
    width: '24px',
    height: '24px',
    borderRadius: '8px',
    color: active ? theme.colors.primaryColor : theme.colors.iconColor,
    display: hide ? 'none' : 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2,
    fontSize: '20px',
    path: {
      fill: 'currentColor',
    },
  };
});
