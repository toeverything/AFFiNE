import { styled, displayFlex } from '../../styles';

export const StyledEmptyContainer = styled.div(() => {
  return {
    ...displayFlex('center', 'center'),
    flexDirection: 'column',

    '.empty-img': {
      width: '320px',
      height: '280px',
    },
  };
});
