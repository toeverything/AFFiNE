import { Button, styled } from '@affine/component';

export const Header = styled('div')({
  height: '44px',
  display: 'flex',
  flexDirection: 'row-reverse',
  paddingRight: '10px',
  paddingTop: '10px',
  flexShrink: 0,
});

export const Content = styled('div')({
  textAlign: 'center',
});

export const ContentTitle = styled('h1')({
  fontSize: '20px',
  lineHeight: '28px',
  fontWeight: 600,
  textAlign: 'center',
});

export const StyleTips = styled('div')(() => {
  return {
    userSelect: 'none',
    width: '400px',
    margin: 'auto',
    marginBottom: '32px',
    marginTop: '12px',
  };
});

export const StyleButton = styled(Button)(() => {
  return {
    width: '284px',
    display: 'block',
    margin: 'auto',
    marginTop: '16px',
  };
});
