import { styled } from '../../..';

export const Header = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  paddingRight: '20px',
  paddingTop: '20px',
  paddingLeft: '24px',
  alignItems: 'center',
});

export const Content = styled('div')({
  padding: '12px 24px 20px 24px',
});

export const Title = styled('div')({
  fontSize: 'var(--affine-font-h6)',
  lineHeight: '26px',
  fontWeight: 600,
});

export const StyleTips = styled('div')(() => {
  return {
    userSelect: 'none',
    marginBottom: '20px',
  };
});
export const ButtonContainer = styled('div')(() => {
  return {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '20px',
    paddingTop: '20px',
  };
});
