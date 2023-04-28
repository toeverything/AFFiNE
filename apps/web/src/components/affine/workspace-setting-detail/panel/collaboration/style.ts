import { styled } from '@affine/component';
import { MuiAvatar } from '@affine/component';

export const StyledMemberTitleContainer = styled('li')(() => {
  return {
    display: 'flex',
    fontWeight: '500',
    marginBottom: '42px',
    flex: 1,
  };
});
export const StyledMemberContainer = styled('div')(() => {
  return {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    overflow: 'hidden',
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
    flexGrow: 1,
    paddingBottom: '58px',
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

export const StyledMemberName = styled('div')(() => {
  return {
    fontWeight: '400',
    fontSize: '18px',
    lineHeight: '26px',
    color: 'var(--affine-text-primary-color)',
  };
});

export const StyledMemberEmail = styled('div')(() => {
  return {
    fontWeight: '400',
    fontSize: '16px',
    lineHeight: '22px',
    color: 'var(--affine-icon-color)',
  };
});

export const StyledMemberButtonContainer = styled('div')(() => {
  return {
    position: 'fixed',
    bottom: '20px',
  };
});

export const StyledMoreVerticalDiv = styled('div')(() => {
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

export const StyledMoreVerticalButton = styled(StyledMoreVerticalDiv)``;
