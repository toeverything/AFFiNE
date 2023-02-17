import { displayFlex, styled } from '../../styles';

export const StyledEmptyContainer = styled.div(() => {
  return {
    height: '100%',
    ...displayFlex('center', 'center'),
    flexDirection: 'column',

    '.empty-img': {
      width: '320px',
      height: '280px',
    },
  };
});
