import { styled } from '@/styles';
import MuiAvatar from '@mui/material/Avatar';

export const StyledMemberTitleContainer = styled('div')(() => {
  return {
    display: 'flex',
    marginTop: '60px',
    fontWeight: '500',
    flex: 1,
  };
});

export const StyledMemberAvatar = styled(MuiAvatar)(() => {
  return { height: '40px', width: '40px' };
});

export const StyledMemberNameContainer = styled('div')(() => {
  return {
    display: 'flex',
    alignItems: 'center',
    width: '402px',
    flex: 2,
  };
});

export const StyledMemberRoleContainer = styled('div')(() => {
  return {
    display: 'flex',
    alignItems: 'center',
    width: '222px',
    flex: 1,
  };
});

export const StyledMemberListContainer = styled('ul')(() => {
  return {
    marginTop: '15px',
    overflowY: 'scroll',
    width: '100%',
    maxHeight: 'calc(100vh - 300px)',
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
    lineHeight: '16px',
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

export const StyledPublishExplanation = styled('div')(() => {
  return {
    paddingRight: '48px',
    fontWeight: '500',
    fontSize: '18px',
    lineHeight: '26px',
    flex: 1,
    marginTop: '60px',
  };
});

export const StyledMemberWarp = styled('div')(() => {
  return {
    display: 'flex',
    flexDirection: 'column',
    padding: '48px 0',
    fontWeight: '500',
    fontSize: '18px',
  };
});
