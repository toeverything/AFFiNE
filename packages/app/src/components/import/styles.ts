import { styled } from '@/styles';

export const StyledTitle = styled.div(({ theme }) => {
  return {
    fontSize: theme.font.h6,
    fontWeight: 600,
    textAlign: 'center',
    marginTop: '45px',
    color: theme.colors.popoverColor,
  };
});

export const StyledButtonWrapper = styled.div(() => {
  return {
    width: '280px',
    margin: '24px auto 0',
    button: {
      display: 'block',
      width: '100%',
      ':not(:last-child)': {
        marginBottom: '16px',
      },
    },
  };
});
