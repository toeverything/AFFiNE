// import { getDataCenter } from '@affine/datacenter';
import { styled } from '@/styles';
import { Button } from '@/ui/button';
// import { useModal } from '@/providers/GlobalModalProvider';
import { GoogleIcon, StayLogOutIcon } from './Icons';
import { useTranslation } from '@affine/i18n';
export const GoogleLoginButton = () => {
  // const { triggerLoginModal } = useModal();
  const { t } = useTranslation();
  return (
    <StyledGoogleButton
      onClick={() => {
        // getDataCenter()
        //   .then(dc => dc.apis.signInWithGoogle?.())
        //   .then(() => {
        //     triggerLoginModal();
        //   })
        //   .catch(error => {
        //     console.log('sign google error', error);
        //   });
      }}
    >
      <ButtonWrapper>
        <IconWrapper>
          <GoogleIcon />
        </IconWrapper>
        <TextWrapper>
          <Title>{t('Continue with Google')}</Title>
          <Description>
            {t('Set up an AFFiNE account to sync data')}
          </Description>
        </TextWrapper>
      </ButtonWrapper>
    </StyledGoogleButton>
  );
};

export const StayLogOutButton = () => {
  const { t } = useTranslation();
  return (
    <StyledStayLogOutButton>
      <ButtonWrapper>
        <IconWrapper>
          <StayLogOutIcon />
        </IconWrapper>
        <TextWrapper>
          <Title>{t('Stay logged out')}</Title>
          <Description>{t('All changes are saved locally')}</Description>
        </TextWrapper>
      </ButtonWrapper>
    </StyledStayLogOutButton>
  );
};

const StyledGoogleButton = styled(Button)(() => {
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

const StyledStayLogOutButton = styled(Button)(() => {
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

const Title = styled('h1')(() => {
  return {
    fontSize: '18px',
    lineHeight: '26px',
    fontWeight: 500,
  };
});

const Description = styled('p')(() => {
  return {
    fontSize: '16px',
    lineHeight: '22px',
    fontWeight: 400,
  };
});
