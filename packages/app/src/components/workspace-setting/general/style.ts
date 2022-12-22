import { styled } from '@/styles';
import MuiAvatar from '@mui/material/Avatar';

export const StyledSettingInputContainer = styled('div')(({ theme }) => {
  return {
    marginTop: '12px',
  };
});

export const StyledDeleteButtonContainer = styled('div')(({ theme }) => {
  return {
    marginTop: '154px',
  };
});

export const StyledSettingAvatarContent = styled('div')(({ theme }) => {
  return {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    height: '72px',
  };
});

export const StyledSettingAvatar = styled(MuiAvatar)(({ theme }) => {
  return { height: '72px', width: '72px' };
});
