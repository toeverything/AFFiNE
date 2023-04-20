import { Button, displayFlex, styled } from '@affine/component';

export const Header = styled('div')({
  height: '44px',
  display: 'flex',
  flexDirection: 'row-reverse',
  paddingRight: '10px',
  paddingTop: '10px',
  flexShrink: 0,
});

export const Content = styled('div')({
  padding: '0 40px',
});

export const ContentTitle = styled('h1')(({ theme }) => {
  return {
    fontSize: theme.font.h6,
    lineHeight: '28px',
    fontWeight: 600,
  };
});

export const StyleTips = styled('div')(({ theme }) => {
  return {
    userSelect: 'none',
    margin: '20px 0',
    a: {
      color: theme.colors.primaryColor,
    },
  };
});

export const StyleButton = styled(Button)(({ theme }) => {
  return {
    textAlign: 'center',
    margin: '20px 0',
    borderRadius: '8px',
    backgroundColor: theme.colors.primaryColor,
    span: {
      margin: '0',
    },
  };
});
export const StyleButtonContainer = styled('div')(() => {
  return {
    width: '100%',
    ...displayFlex('flex-end', 'center'),
  };
});
export const StyleImage = styled('div')(() => {
  return {
    width: '100%',
  };
});
