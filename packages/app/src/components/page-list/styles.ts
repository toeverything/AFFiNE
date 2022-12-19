import { displayFlex, styled, textEllipsis } from '@/styles';
import { TableRow } from '@/ui/table';
import Link from 'next/link';

export const StyledTableContainer = styled.div(() => {
  return {
    height: 'calc(100vh - 60px)',
    padding: '78px 72px',
    overflowY: 'auto',
  };
});
export const StyledTitleWrapper = styled.div(({ theme }) => {
  return {
    ...displayFlex('flex-start', 'center'),
    a: {
      color: 'inherit',
    },
    'a:visited': {
      color: 'unset',
    },
    'a:hover': {
      color: theme.colors.primaryColor,
    },
  };
});
export const StyledTitleLink = styled.div(({ theme }) => {
  return {
    maxWidth: '80%',
    marginRight: '18px',
    ...displayFlex('flex-start', 'center'),
    color: theme.colors.textColor,
    '>svg': {
      fontSize: '24px',
      marginRight: '12px',
      color: theme.colors.iconColor,
    },
  };
});

export const StyledTableRow = styled(TableRow)(({ theme }) => {
  return {
    cursor: 'pointer',
    '&:hover': {
      '.favorite-button': {
        display: 'flex',
      },
    },
  };
});
