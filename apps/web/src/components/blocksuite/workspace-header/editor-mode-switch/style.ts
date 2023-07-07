import { displayFlex, styled } from '@affine/component';

export const StyledEditorModeSwitch = styled('div')<{
  switchLeft: boolean;
  showAlone?: boolean;
}>(({ switchLeft, showAlone }) => {
  return {
    width: showAlone ? '40px' : '78px',
    height: '32px',
    background: showAlone
      ? 'transparent'
      : 'var(--affine-background-secondary-color)',
    borderRadius: '12px',
    ...displayFlex('space-between', 'center'),
    padding: '0 8px',
    position: 'relative',

    '::after': {
      content: '""',
      display: showAlone ? 'none' : 'block',
      width: '24px',
      height: '24px',
      background: 'var(--affine-background-primary-color)',
      boxShadow: 'var(--affine-shadow-1)',
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
}>(({ active = false, hide = false }) => {
  return {
    width: '24px',
    height: '24px',
    borderRadius: '8px',
    WebkitAppRegion: 'no-drag',
    boxShadow: active ? 'var(--affine-shadow-1)' : 'none',
    color: active ? 'var(--affine-primary-color)' : 'var(--affine-icon-color)',
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

export const StyledKeyboardItem = styled('span')(() => {
  return {
    marginLeft: '5px',
    fontSize: '4px',
    paddingLeft: '5px',
    paddingRight: '5px',
    backgroundColor: '#55545A',
    borderRadius: '4px',
  };
});
