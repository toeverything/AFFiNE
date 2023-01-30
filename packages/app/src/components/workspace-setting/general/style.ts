import { displayFlex, styled } from '@/styles';
import MuiAvatar from '@mui/material/Avatar';
import IconButton from '@/ui/button/IconButton';
import Input from '@/ui/input';

export const StyledSettingInputContainer = styled('div')(() => {
  return {
    marginTop: '12px',
    width: '100%',
    ...displayFlex('flex-start', 'center'),
  };
});

export const StyledDeleteButtonContainer = styled('div')(() => {
  return {
    textAlign: 'center',
  };
});
export const StyleGeneral = styled('div')(() => {
  return {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  };
});
export const StyledDoneButtonContainer = styled(IconButton)(({ theme }) => {
  return {
    border: `1px solid ${theme.colors.borderColor}`,
    borderRadius: '10px',
    height: '32px',
    overflow: 'hidden',
    marginLeft: '20px',
    ':hover': {
      borderColor: theme.colors.primaryColor,
    },
  };
});
export const StyledInput = styled(Input)(({ theme }) => {
  return {
    border: `1px solid ${theme.colors.borderColor}`,
    borderRadius: '10px',
    fontSize: theme.font.sm,
  };
});

export const StyledSettingAvatarContent = styled('div')(() => {
  return {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    height: '72px',
  };
});

export const StyledSettingAvatar = styled(MuiAvatar)(() => {
  return { height: '72px', width: '72px', marginRight: '24px' };
});

export const StyledProviderInfo = styled('p')(({ theme }) => {
  return {
    color: theme.colors.iconColor,
    fontSize: theme.font.sm,
    svg: {
      verticalAlign: 'sub',
      marginRight: '10px',
    },
  };
});

export const StyledAvatar = styled('div')(() => {
  return {
    position: 'relative',
    marginRight: '20px',
    cursor: 'pointer',
    ':hover': {
      '.camera-icon': {
        display: 'block',
      },
    },
    '.camera-icon': {
      position: 'absolute',
      display: 'none',
      width: '100%',
      height: '100%',
      borderRadius: '50%',
      backgroundColor: 'rgba(60, 61, 63, 0.5)',
      top: 0,
      left: 0,
      textAlign: 'center',
      lineHeight: '72px',
    },
  };
});
