import { displayFlex, styled } from '@affine/component';

export const StyledContainer = styled.div(() => {
  return {
    ...displayFlex('center', 'center'),
    flexDirection: 'column',
    height: '100vh',

    img: {
      width: '360px',
      height: '270px',
    },
    p: {
      fontSize: '22px',
      fontWeight: 600,
      margin: '24px 0',
    },
  };
});
