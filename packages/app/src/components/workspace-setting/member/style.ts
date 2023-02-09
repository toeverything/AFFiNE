import { styled } from '@/styles';
import { MuiAvatar } from '@/ui/mui';

export const StyledMemberTitleContainer = styled('li')(() => {
  return {
    display: 'flex',
    fontWeight: '500',
    marginBottom: '32px',
    flex: 1,
  };
});
export const StyledMemberContainer = styled('div')(() => {
  return {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
  };
});

export const StyledMemberAvatar = styled(MuiAvatar)(() => {
  return { height: '40px', width: '40px' };
});

export const StyledMemberNameContainer = styled('div')(() => {
  return {
    display: 'flex',
    alignItems: 'center',
    flex: '2 0 402px',
  };
});

export const StyledMemberRoleContainer = styled('div')(() => {
  return {
    display: 'flex',
    alignItems: 'center',
    flex: '1 0 222px',
  };
});

export const StyledMemberListContainer = styled('ul')(() => {
  return {
    overflowY: 'scroll',
    width: '100%',
    flex: 1,
  };
});

export const StyledMemberListItem = styled('li')(() => {
  return {
    display: 'flex',
    alignItems: 'center',
    height: '72px',
    width: '100%',
  };
});

export const StyledMemberInfo = styled('div')(() => {
  return {
    paddingLeft: '12px',
  };
});

export const StyledMemberName = styled('div')(({ theme }) => {
  return {
    fontWeight: '400',
    fontSize: '18px',
    lineHeight: '26px',
    color: theme.colors.textColor,
  };
});

export const StyledMemberEmail = styled('div')(({ theme }) => {
  return {
    fontWeight: '400',
    fontSize: '16px',
    lineHeight: '22px',
    color: theme.colors.iconColor,
  };
});

export const StyledMemberButtonContainer = styled('div')(() => {
  return {
    position: 'absolute',
    bottom: '0',
    marginBottom: '20px',
  };
});

export const StyledMoreVerticalButton = styled('button')(() => {
  return {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
    paddingRight: '48px',
  };
});
