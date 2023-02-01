import { styled } from '@/styles';
import { Button } from '@/ui/button';
import { GoogleIcon, StayLogOutIcon } from './Icons';
import { useTranslation } from '@affine/i18n';
export const GoogleLoginButton = () => {
  const { t } = useTranslation();

  return (
    <StyledGoogleButton>
      <ButtonWrapper>
        <IconWrapper>
          <GoogleIcon />
        </IconWrapper>
        <TextWrapper>{t('Continue with Google')}</TextWrapper>
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

const StyledGoogleButton = styled('div')(({ theme }) => {
  return {
    width: '284px',
    height: '40px',
    marginTop: '30px',
    fontSize: '16px',
    cursor: 'pointer',
    borderRadius: '40px',
    border: `1px solid ${theme.colors.iconColor}`,
    overflow: 'hidden',
    ':hover': {
      border: `1px solid ${theme.colors.primaryColor}`,
    },
  };
});

const StyledStayLogOutButton = styled(Button)(() => {
  return {
    width: '361px',
    height: '56px',
    padding: '4px',
    ':hover': {
      borderColor: '#6880FF',
    },
  };
});

const ButtonWrapper = styled('div')({
  display: 'flex',
  flexDirection: 'row',
  width: '100%',
});

const IconWrapper = styled('div')({
  flex: '0 48px',
  borderRadius: '5px',
  overflow: 'hidden',
  marginRight: '12px',
  marginTop: '8px',
});

const TextWrapper = styled('div')({
  flex: 1,
  textAlign: 'left',
  height: '40px',
  lineHeight: '40px',
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
