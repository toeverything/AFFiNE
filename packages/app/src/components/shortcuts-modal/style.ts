import { styled } from '@/styles';

export const StyledShortcutsModal = styled.div(({ theme }) => ({
  width: '268px',
  height: '66vh',
  backgroundColor: theme.colors.popoverBackground,
  boxShadow: theme.shadow.popover,
  color: theme.colors.popoverColor,
  padding: '8px 16px',
  overflow: 'auto',
  boxRadius: '10px',
  position: 'fixed',
  right: '12px',
  top: '0',
  bottom: '0',
  margin: 'auto',
  zIndex: theme.zIndex.modal,
}));
export const StyledTitle = styled.div(({ theme }) => ({
  color: theme.colors.textColor,
  fontWeight: '600',
  fontSize: theme.font.sm,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  svg: {
    width: '20px',
    marginRight: '14px',
    color: theme.colors.primaryColor,
  },
}));
export const StyledSubTitle = styled.div(({ theme }) => ({
  color: theme.colors.textColor,
  fontWeight: '500',
  fontSize: '12px',
  height: '36px',
  lineHeight: '36px',
}));
export const StyledModalHeader = styled.div(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  height: '36px',
}));

export const StyledListItem = styled.div(({ theme }) => ({
  height: '32px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: theme.font.xs,
}));

export const CloseButton = styled('div')(({ theme }) => {
  return {
    width: '24px',
    height: '24px',
    borderRadius: '5px',
    color: theme.colors.iconColor,
    cursor: 'pointer',
    ':hover': {
      background: theme.colors.hoverBackground,
    },
  };
});
