import { displayFlex, styled } from '@/styles';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';

export const StyledTitle = styled.div(() => {
  return {
    ...displayFlex('center', 'center'),
    fontSize: '20px',
    fontWeight: 500,
    marginTop: '60px',
    lineHeight: 1,
  };
});

export const StyledContent = styled.div(() => {
  return {
    padding: '0 40px',
    marginTop: '32px',
    fontSize: '18px',
    lineHeight: '25px',
    'p:not(last-of-type)': {
      marginBottom: '10px',
    },
  };
});

export const StyledButton = styled.div(({ theme }) => {
  return {
    width: '146px',
    height: '42px',
    background: theme.colors.primaryColor,
    color: '#FFFFFF',
    fontSize: '18px',
    fontWeight: 500,
    borderRadius: '21px',
    margin: '52px auto 0',
    cursor: 'pointer',
    ...displayFlex('center', 'center'),
  };
});
export const StyledFormControl = styled(FormControl)(({ theme }) => {
  return {
    position: 'absolute',
    minWidth: '100px',
    right: '50px',
    backgroundColor: theme.colors.popoverBackground,
  };
});
export const StyledSelect = styled(Select)(({ theme }) => {
  return {
    backgroundColor: theme.colors.popoverBackground,
    color: theme.colors.popoverColor,
  };
});
export const StyledMenuItem = styled(MenuItem)(() => {
  return {};
});
