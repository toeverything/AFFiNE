import { StyledContainer } from './styles';
import { useTranslation } from '@affine/i18n';
import { Button } from '@affine/component';
import { useRouter } from 'next/router';
import Image from 'next/image';
import ErrorImg from '../../../public/imgs/invite-error.svg';
export const NotfoundPage = () => {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <StyledContainer>
      <Image alt="404" src={ErrorImg}></Image>

      <p>{t('404 - Page Not Found')}</p>
      <Button
        shape="round"
        onClick={() => {
          router.push('/workspace');
        }}
      >
        {t('Back Home')}
      </Button>
    </StyledContainer>
  );
};

export default NotfoundPage;
