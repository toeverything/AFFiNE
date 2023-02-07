import { absoluteCenter, displayFlex, styled } from '@affine/component';

export const StyledBigLink = styled('a')(({ theme }) => {
  return {
    width: '334px',
    height: '100px',
    marginBottom: '48px',
    paddingLeft: '90px',
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
      ...absoluteCenter({ vertical: true, position: { left: '20px' } }),
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
    width: '190px',
    fontSize: '18px',
    fontWeight: '600',
    color: theme.colors.textColor,
    marginBottom: '24px',
  };
});

export const StyledLeftContainer = styled('div')({
  width: '320px',
  flexDirection: 'column',
  ...displayFlex('space-between', 'center'),
});
export const StyledRightContainer = styled('div')({
  width: '214px',
  flexShrink: '0',
  flexDirection: 'column',
  ...displayFlex('center', 'flex-end'),
});

export const StyledContent = styled('div')({
  height: '276px',
  width: '100%',
  padding: '0 140px',
  ...displayFlex('space-between', 'center'),
  color: '#3A4C5C',
  marginTop: '58px',
  letterSpacing: '0.06em',
});

export const StyledLogo = styled('img')({
  height: '18px',
  width: 'auto',
});

export const StyledModalHeader = styled('div')(() => {
  return {
    height: '20px',
    marginTop: '36px',
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

export const StyledModalFooter = styled('div')(({ theme }) => {
  return {
    fontSize: '14px',
    lineHeight: '20px',
    textAlign: 'center',
    color: theme.colors.textColor,

    marginTop: '40px',
    'p:first-of-type': {
      color: theme.colors.primaryColor,
      letterSpacing: '0.06em',
      marginBottom: '25px',
      a: {
        ':visited': {
          color: theme.colors.linkColor,
        },
      },
    },
  };
});
