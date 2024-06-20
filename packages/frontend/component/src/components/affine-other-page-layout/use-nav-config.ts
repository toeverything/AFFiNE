import { useI18n } from '@affine/i18n';
import { useMemo } from 'react';

export const useNavConfig = () => {
  const t = useI18n();
  return useMemo(
    () => [
      {
        title: t['com.affine.other-page.nav.official-website'](),
        path: 'https://affine.pro',
      },
      {
        title: t['com.affine.other-page.nav.affine-community'](),
        path: 'https://community.affine.pro/home',
      },
      {
        title: t['com.affine.other-page.nav.blog'](),
        path: 'https://affine.pro/blog',
      },
      {
        title: t['com.affine.other-page.nav.contact-us'](),
        path: 'https://affine.pro/about-us',
      },
    ],
    [t]
  );
};
