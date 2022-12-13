import { HeaderWrapper } from '@/components/header';
import { styled } from '@/styles';

export const StyledWrapper = styled(HeaderWrapper)(({ theme }) => {
  return {
    fontSize: theme.font.sm,
    color: theme.colors.textColor,
    '>svg': {
      fontSize: '20px',
      marginRight: '12px',
    },
  };
});
