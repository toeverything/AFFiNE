import { displayFlex, styled } from '@/styles';
import bg from './bg.png';

export const ModalWrapper = styled.div(({ theme }) => {
  return {
    width: '348px',
    height: '388px',
    background: theme.colors.popoverBackground,
    borderRadius: '28px',
    position: 'relative',
    backgroundImage: `url(${bg.src})`,
  };
});

export const StyledCloseButton = styled.div(({ theme }) => {
  return {
    width: '66px',
    height: '66px',
    color: theme.colors.iconColor,
    cursor: 'pointer',
    ...displayFlex('center', 'center'),
    position: 'absolute',
    right: '0',
    top: '0',

    svg: {
      width: '15px',
      height: '15px',
      position: 'relative',
      zIndex: 1,
    },
  };
});

export const StyledTitle = styled.div(({ theme }) => {
  return {
    ...displayFlex('center', 'center'),
    fontSize: '20px',
    fontWeight: 500,
    marginTop: '60px',
    lineHeight: 1,
  };
});

export const StyledContent = styled.div(({ theme }) => {
  return {
    padding: '0 40px',
    marginTop: '32px',
    fontSize: '18px',
    lineHeight: '25px',
    'p:not(last-of-type)': {
      marginBottom: '10px',
    },
  };
});

export const StyledButton = styled.div(({ theme }) => {
  return {
    width: '146px',
    height: '42px',
    background: theme.colors.primaryColor,
    color: '#FFFFFF',
    fontSize: '18px',
    fontWeight: 500,
    borderRadius: '21px',
    margin: '52px auto 0',
    cursor: 'pointer',
    ...displayFlex('center', 'center'),
  };
});
