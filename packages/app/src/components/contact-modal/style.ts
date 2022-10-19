import { styled } from '@/styles';
import bg from './bg.png';
export const StyledModalContainer = styled('div')(({ theme }) => {
  return {
    width: '100vw',
    height: '100vh',
    position: 'fixed',
    left: '0',
    top: '0',
    zIndex: theme.zIndex.modal,
  };
});

export const StyledModalWrapper = styled('div')(({ theme }) => {
  return {
    width: '1000px',
    height: '626px',
    backgroundColor: theme.colors.popoverBackground,
    backgroundImage: `url(${bg.src})`,
    padding: '0 48px',
    borderRadius: '20px',
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    margin: 'auto',
  };
});

export const StyledBigLink = styled('a')(({ theme }) => {
  return {
    width: '335px',
    height: '110px',
    marginBottom: '52px',
    display: 'flex',
    alignItems: 'center',
    fontSize: '24px',
    lineHeight: '36px',
    padding: '0 24px',
    fontWeight: '600',
    color: theme.colors.textColor,
    borderRadius: '10px',

    ':visited': {
      color: theme.colors.textColor,
    },
    ':hover': {
      color: theme.colors.primaryColor,
      background: theme.colors.hoverBackground,
    },
    ':last-of-type': {
      marginBottom: 0,
    },
    svg: {
      width: '50px',
      height: '50px',
      marginRight: '40px',
      color: theme.colors.primaryColor,
    },
    p: {
      width: '197px',
      height: '73px',
    },
  };
});
export const StyledSmallLink = styled('a')(({ theme }) => {
  return {
    width: '214px',
    height: '37px',
    display: 'flex',
    alignItems: 'center',
    fontSize: '18px',
    fontWeight: '500',
    paddingLeft: '24px',
    borderRadius: '5px',
    color: theme.colors.textColor,
    ':visited': {
      color: theme.colors.textColor,
    },
    ':hover': {
      color: theme.colors.primaryColor,
      background: theme.colors.hoverBackground,
    },
    svg: {
      width: '22px',
      marginRight: '30px',
      color: theme.colors.primaryColor,
    },
  };
});
export const StyledSubTitle = styled('div')(({ theme }) => {
  return {
    width: '189px',
    fontSize: '18px',
    fontWeight: '600',
    color: theme.colors.textColor,
    marginBottom: '24px',
  };
});

export const StyledLeftContainer = styled('div')({
  // height: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
});
export const StyledRightContainer = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'flex-end',
});

export const StyledContent = styled('div')({
  height: '276px',
  width: '100%',
  padding: '0 160px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: '#3A4C5C',
  marginTop: '100px',
});

export const StyledBackdrop = styled('div')(({ theme }) => {
  return { width: '100%', height: '100%', background: 'rgba(58, 76, 92, 0.2)' };
});
export const StyledLogo = styled('img')({
  height: '22px',
  width: 'auto',
});

export const StyledModalHeader = styled('div')(({ theme }) => {
  return {
    height: '30px',
    marginTop: '54px',
    padding: '0 48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };
});

export const StyledModalHeaderLeft = styled('div')(({ theme }) => {
  return {
    display: 'flex',
    alignItems: 'center',
    color: theme.colors.primaryColor,

    'span:first-of-type': {
      fontSize: '28px',
      lineHeight: 1,
      fontWeight: '600',
      margin: '0 12px',
    },
    'span:last-of-type': {
      height: '26px',
      border: `1px solid ${theme.colors.primaryColor}`,
      borderRadius: '10px',
      padding: '0 10px',
      lineHeight: '26px',
      fontSize: '16px',
    },
  };
});

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

export const StyledModalFooter = styled('div')(({ theme }) => {
  return {
    fontSize: '14px',
    lineHeight: '20px',
    textAlign: 'center',
    color: theme.colors.textColor,

    marginTop: '75px',
    'p:first-of-type': {
      color: theme.colors.primaryColor,
      marginBottom: '10px',
    },
  };
});
