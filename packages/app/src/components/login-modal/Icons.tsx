import { CloudUnsyncedIcon } from '@blocksuite/icons';
import { styled } from '@/styles';
import GoogleSvg from './google.svg';

export const GoogleIcon = () => {
  return (
    <GoogleIconWrapper>
      <picture>
        <img src={GoogleSvg.src} alt="Google" />
      </picture>
    </GoogleIconWrapper>
  );
};

const GoogleIconWrapper = styled('div')(({ theme }) => ({
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
