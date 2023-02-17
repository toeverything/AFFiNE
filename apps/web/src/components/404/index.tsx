import { Button } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import Image from 'next/image';
import { useRouter } from 'next/router';

import ErrorImg from '../../../public/imgs/invite-error.svg';
import { StyledContainer } from './styles';

export const NotfoundPage = () => {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <StyledContainer data-testid="notFound">
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
