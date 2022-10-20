import { absoluteCenter, displayFlex, styled } from '@/styles';
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
    width: '860px',
    height: '626px',
    backgroundColor: theme.colors.popoverBackground,
    backgroundImage: `url(${bg.src})`,
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
    width: '320px',
    height: '100px',
    marginBottom: '48px',
    paddingLeft: '114px',
    fontSize: '24px',
    lineHeight: '36px',
    fontWeight: '600',
    color: theme.colors.textColor,
    borderRadius: '10px',
    flexDirection: 'column',
    ...displayFlex('center'),
    position: 'relative',
    transition: 'background .15s',
    ':visited': {
      color: theme.colors.textColor,
    },
    ':hover': {
      background: 'rgba(68, 97, 242, 0.1)',
    },
    ':last-of-type': {
      marginBottom: 0,
    },
    svg: {
      width: '50px',
      height: '50px',
      marginRight: '40px',
      color: theme.colors.primaryColor,
      ...absoluteCenter({ vertical: true, position: { left: '32px' } }),
    },
    p: {
      width: '100%',
      height: '30px',
      lineHeight: '30px',
      ...displayFlex('flex-start', 'center'),
      ':not(:last-of-type)': {
        marginBottom: '4px',
      },
      ':first-of-type': {
        fontSize: '22px',
      },
      ':last-of-type': {
        fontSize: '20px',
        color: theme.colors.primaryColor,
      },
      svg: {
        width: '15px',
        height: '15px',
        position: 'static',
        transform: 'translate(0,0)',
        marginLeft: '5px',
      },
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
    transition: 'background .15s, color .15s',

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
  flexDirection: 'column',
  ...displayFlex('space-between', 'center'),
});
export const StyledRightContainer = styled('div')({
  flexDirection: 'column',
  ...displayFlex('center', 'flex-end'),
});

export const StyledContent = styled('div')({
  height: '276px',
  width: '100%',
  padding: '0 145px',
  ...displayFlex('space-between', 'center'),
  color: '#3A4C5C',
  marginTop: '100px',
});

export const StyledBackdrop = styled('div')(({ theme }) => {
  return { width: '100%', height: '100%', background: 'rgba(58, 76, 92, 0.2)' };
});
export const StyledLogo = styled('img')({
  height: '18px',
  width: 'auto',
});

export const StyledModalHeader = styled('div')(({ theme }) => {
  return {
    height: '30px',
    marginTop: '54px',
    padding: '0 48px',
    ...displayFlex('space-between', 'center'),
  };
});

export const StyledModalHeaderLeft = styled('div')(({ theme }) => {
  return {
    color: theme.colors.primaryColor,
    ...displayFlex('flex-end', 'flex-end'),
    span: {
      height: '20px',
      border: `1px solid ${theme.colors.primaryColor}`,
      borderRadius: '10px',
      padding: '0 8px',
      lineHeight: '26px',
      fontSize: '14px',
      marginLeft: '12px',
      ...displayFlex('center', 'center'),
    },
  };
});

export const CloseButton = styled('div')(({ theme }) => {
  return {
    width: '30px',
    height: '30px',
    borderRadius: '6px',
    color: theme.colors.iconColor,
    cursor: 'pointer',
    ...displayFlex('center', 'center'),
    ':hover': {
      background: theme.colors.hoverBackground,
    },
    svg: {
      width: '20px',
      height: '20px',
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
