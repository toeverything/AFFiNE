import { displayFlex, styled } from '@affine/component';

export const StyledShortcutsModal = styled('div')(({ theme }) => ({
  width: '288px',
  height: '74vh',
  paddingBottom: '28px',
  backgroundColor: 'var(--affine-white)',
  boxShadow: 'var(--affine-text-popover-shadow)',
  borderRadius: `var(--affine-popover-radius) 0 var(--affine-popover-radius) var(--affine-popover-radius)`,
  overflow: 'auto',
  boxRadius: '10px',
  position: 'fixed',
  right: '12px',
  top: '0',
  bottom: '0',
  margin: 'auto',
  zIndex: 'var(--affine-z-index-modal)',
}));
export const StyledTitle = styled('div')(({ theme }) => ({
  color: 'var(--affine-text-primary-color)',
  fontWeight: '500',
  fontSize: 'var(--affine-font-sm)',
  height: '44px',
  ...displayFlex('center', 'center'),
  svg: {
    width: '20px',
    marginRight: '14px',
    color: 'var(--affine-primary-color)',
  },
}));
export const StyledSubTitle = styled('div')(({ theme }) => ({
  fontWeight: '500',
  fontSize: 'var(--affine-font-sm)',
  height: '34px',
  lineHeight: '36px',
  marginTop: '28px',
  padding: '0 16px',
}));
export const StyledModalHeader = styled('div')(() => ({
  ...displayFlex('space-between', 'center'),
  paddingTop: '8px 4px 0 4px',
  width: '100%',
  padding: '8px 16px 0 16px',
  position: 'sticky',
  left: '0',
  top: '0',
  background: 'var(--affine-popover-background)',

  transition: 'background-color 0.5s',
}));

export const StyledListItem = styled('div')(({ theme }) => ({
  height: '34px',
  ...displayFlex('space-between', 'center'),
  fontSize: 'var(--affine-font-sm)',
  padding: '0 16px',
}));
