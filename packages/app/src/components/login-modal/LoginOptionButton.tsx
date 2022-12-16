import { useEffect } from 'react';
import {
  signInWithGoogle,
  onAuthStateChanged,
  login,
} from '@pathfinder/data-services';
import { styled } from '@/styles';
import { Button } from '@/ui/button';
import { GoogleIcon, StayLogOutIcon } from './icons';

export const GoogleLoginButton = () => {
  useEffect(() => {
    onAuthStateChanged(async user => {
      console.log('on auth state changed', user);
      const token = await user?.getIdToken();
      if (!token) {
        return;
      }
      const ret = await login({ token, type: 'Google' });
      console.log('login', ret);
    });
  });
  return (
    <StyledGoogleButton
      onClick={() => {
        signInWithGoogle()
          .then(ret => {
            console.log('sign google', ret);
          })
          .catch(error => {
            console.log('sign google error', error);
          });
      }}
    >
      <ButtonWrapper>
        <IconWrapper>
          <GoogleIcon />
        </IconWrapper>
        <TextWrapper>
          <Title>Continue with Google</Title>
          <Description>Set up an AFFINE account to sync data</Description>
        </TextWrapper>
      </ButtonWrapper>
    </StyledGoogleButton>
  );
};

export const StayLogOutButton = () => {
  return (
    <StyledStayLogOutButton>
      <ButtonWrapper>
        <IconWrapper>
          <StayLogOutIcon />
        </IconWrapper>
        <TextWrapper>
          <Title>Stay logged out</Title>
          <Description>All changes are saved locally</Description>
        </TextWrapper>
      </ButtonWrapper>
    </StyledStayLogOutButton>
  );
};

const StyledGoogleButton = styled(Button)(({ theme }) => {
  return {
    width: '361px',
    height: '56px',
    padding: '4px',
    background: '#6880FF',
    color: '#fff',

    '& > span': {
      marginLeft: 0,
    },

    ':hover': {
      background: '#516BF4',
      color: '#fff',
    },
  };
});

const StyledStayLogOutButton = styled(Button)(({ theme }) => {
  return {
    width: '361px',
    height: '56px',
    padding: '4px',

    '& > span': {
      marginLeft: 0,
    },

    ':hover': {
      borderColor: '#6880FF',
    },
  };
});

const ButtonWrapper = styled('div')({
  display: 'flex',
  flexDirection: 'row',
});

const IconWrapper = styled('div')({
  width: '48px',
  height: '48px',
  flex: '0 48px',
  borderRadius: '5px',
  overflow: 'hidden',
  marginRight: '12px',
});

const TextWrapper = styled('div')({
  flex: 1,
  textAlign: 'left',
});

const Title = styled('h1')(({ theme }) => {
  return {
    fontSize: '18px',
    lineHeight: '26px',
    fontWeight: 500,
  };
});

const Description = styled('p')(({ theme }) => {
  return {
    fontSize: '16px',
    lineHeight: '22px',
    fontWeight: 400,
  };
});
