import { absoluteCenter, displayFlex, styled } from '@affine/component';

export const StyledBigLink = styled('a')(({ theme }) => {
  return {
    width: '268px',
    height: '76px',
    paddingLeft: '96px',
    fontSize: '24px',
    lineHeight: '36px',
    color: 'var(--affine-text-primary-color)',
    borderRadius: '10px',
    flexDirection: 'column',
    ...displayFlex('center'),
    position: 'relative',
    transition: 'background .15s',
    letterSpacing: '1px',

    ':visited': {
      color: 'var(--affine-text-primary-color)',
    },
    ':hover': {
      background: 'rgba(68, 97, 242, 0.1)',
    },
    ':not(:last-of-type)': {
      marginRight: '48px',
    },
    svg: {
      width: '48px',
      height: '48px',
      marginRight: '24px',
      color: 'var(--affine-primary-color)',
      ...absoluteCenter({ vertical: true, position: { left: '26px' } }),
    },
    p: {
      width: '100%',
      height: '24px',
      lineHeight: '24px',

      ...displayFlex('flex-start', 'center'),
      ':first-of-type': {
        marginBottom: '4px',
        fontSize: '18px',
        fontWeight: '600',
      },
      ':last-of-type': {
        fontSize: '16px',
        color: 'var(--affine-primary-color)',
        fontWeight: '500',
      },
      svg: {
        width: '20px',
        height: '20px',
        position: 'static',
        transform: 'translate(0,0)',
        marginLeft: '4px',
      },
    },
  };
});
export const StyledSmallLink = styled('a')(({ theme }) => {
  return {
    width: '124px',
    height: '76px',
    fontSize: '16px',
    fontWeight: '500',
    borderRadius: '5px',
    color: 'var(--affine-text-primary-color)',
    transition: 'background .15s, color .15s',

    ...displayFlex('center', 'center'),
    flexWrap: 'wrap',
    ':visited': {
      color: 'var(--affine-text-primary-color)',
    },
    ':hover': {
      color: 'var(--affine-primary-color)',
      background: 'var(--affine-hover-color)',
    },
    svg: {
      width: '22px',
      color: 'var(--affine-primary-color)',
    },
    p: {
      width: '100%',
      textAlign: 'center',
    },
  };
});
export const StyledSubTitle = styled('div')(({ theme }) => {
  return {
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--affine-text-primary-color)',
    marginTop: '52px',
    marginBottom: '8px',
    textAlign: 'center',
  };
});

export const StyledLogo = styled('img')({
  height: '18px',
  width: 'auto',
  marginTop: '24px',
});

export const StyledModalHeader = styled('div')(() => {
  return {
    height: '72px',
    padding: '0 40px',
    marginBottom: '24px',
  };
});

export const StyledModalFooter = styled('div')(({ theme }) => {
  return {
    fontSize: '14px',
    lineHeight: '20px',
    textAlign: 'center',
    color: 'var(--affine-text-primary-color)',
    marginTop: '40px',
  };
});

export const StyledPrivacyContainer = styled('div')(({ theme }) => {
  return {
    marginTop: '4px',
    position: 'relative',
    a: {
      height: '16px',
      lineHeight: '16px',
      color: 'var(--affine-icon-color)',
      padding: '0 8px',
      ':visited': {
        color: 'var(--affine-icon-color)',
      },
      ':first-of-type': {
        borderRight: '1px solid var(--affine-border-color)',
      },
      ':hover': {
        color: 'var(--affine-primary-color)',
      },
    },
  };
});
