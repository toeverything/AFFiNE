import { CloudUnsyncedIcon } from '@blocksuite/icons';
import { styled } from '@/styles';
import GoogleSvg from './google.svg';

export const GoogleIcon = () => {
  return (
    <GoogleIconWrapper>
      <img src={GoogleSvg.src} alt="Google" />
    </GoogleIconWrapper>
  );
};

const GoogleIconWrapper = styled('div')(({ theme }) => ({
  width: '48px',
  height: '48px',
  background: theme.colors.pageBackground,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}));

export const StayLogOutIcon = () => {
  return (
    <StayLogOutWrapper>
      <CloudUnsyncedIcon />
    </StayLogOutWrapper>
  );
};

const StayLogOutWrapper = styled('div')(({ theme }) => {
  return {
    width: '48px',
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    background: theme.colors.hoverBackground,
  };
});
