import { displayFlex, styled } from '@affine/component';
import { Button } from '@toeverything/components/button';

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

export const ContentTitle = styled('h1')(() => {
  return {
    marginTop: 44,
    fontSize: 'var(--affine-font-h6)',
    lineHeight: '28px',
    fontWeight: 600,
  };
});

export const StyleTips = styled('div')(() => {
  return {
    margin: '0 0 20px 0',
    a: {
      color: 'var(--affine-primary-color)',
    },
  };
});

export const StyleButton = styled(Button)(() => {
  return {
    textAlign: 'center',
    borderRadius: '8px',
    backgroundColor: 'var(--affine-primary-color)',
    span: {
      margin: '0',
    },
  };
});
export const StyleButtonContainer = styled('div')(() => {
  return {
    width: '100%',
    marginTop: 20,
    ...displayFlex('flex-end', 'center'),
  };
});
export const StyleImage = styled('div')(() => {
  return {
    ...displayFlex('center', 'center'),
  };
});
