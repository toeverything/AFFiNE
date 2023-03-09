import { displayFlex, styled } from '@affine/component';

export const StyledEditorModeSwitch = styled('div')<{
  switchLeft: boolean;
  showAlone?: boolean;
}>(({ theme, switchLeft, showAlone }) => {
  return {
    width: showAlone ? '40px' : '78px',
    height: '32px',
    background: showAlone ? 'transparent' : theme.colors.codeBlockBackground,
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
      boxShadow: '0px 0px 6px #E2E2E2',
      borderRadius: '8px',
      zIndex: 1,
      position: 'absolute',
      transform: `translateX(${switchLeft ? '0' : '38px'})`,
      transition: 'all .15s',
    },
  };
});

export const StyledSwitchItem = styled('button')<{
  active: boolean;
  hide?: boolean;
}>(({ theme, active, hide = false }) => {
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
  };
});
