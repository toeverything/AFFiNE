import { useI18n } from '@affine/i18n';
import { SignOutIcon } from '@blocksuite/icons/rc';

import { Avatar } from '../../ui/avatar';
import { Button, IconButton } from '../../ui/button';
import { AffineOtherPageLayout } from '../affine-other-page-layout';
import type { User } from '../auth-components';
import { NotFoundPattern } from './not-found-pattern';
import {
  largeButtonEffect,
  notFoundPageContainer,
  wrapper,
} from './styles.css';

export interface NotFoundPageProps {
  user?: User | null;
  signInComponent?: JSX.Element;
  onBack: () => void;
  onSignOut: () => void;
}
export const NoPermissionOrNotFound = ({
  user,
  onBack,
  onSignOut,
  signInComponent,
}: NotFoundPageProps) => {
  const t = useI18n();

  return (
    <AffineOtherPageLayout>
      <div className={notFoundPageContainer} data-testid="not-found">
        {user ? (
          <>
            <div className={wrapper}>
              <NotFoundPattern />
            </div>
            <p className={wrapper}>{t['404.hint']()}</p>
            <div className={wrapper}>
              <Button
                variant="primary"
                size="extraLarge"
                onClick={onBack}
                className={largeButtonEffect}
              >
                {t['404.back']()}
              </Button>
            </div>
            <div className={wrapper}>
              <Avatar url={user.avatar ?? user.image} name={user.label} />
              <span style={{ margin: '0 12px' }}>{user.email}</span>
              <IconButton
                onClick={onSignOut}
                size="20"
                tooltip={t['404.signOut']()}
              >
                <SignOutIcon />
              </IconButton>
            </div>
          </>
        ) : (
          signInComponent
        )}
      </div>
    </AffineOtherPageLayout>
  );
};

export const NotFoundPage = ({
  user,
  onBack,
  onSignOut,
}: NotFoundPageProps) => {
  const t = useI18n();

  return (
    <AffineOtherPageLayout>
      <div className={notFoundPageContainer} data-testid="not-found">
        <div className={wrapper}>
          <NotFoundPattern />
        </div>
        <p className={wrapper}>{t['404.hint']()}</p>
        <div className={wrapper}>
          <Button
            variant="primary"
            size="extraLarge"
            onClick={onBack}
            className={largeButtonEffect}
          >
            {t['404.back']()}
          </Button>
        </div>

        {user ? (
          <div className={wrapper}>
            <Avatar url={user.avatar ?? user.image} name={user.label} />
            <span style={{ margin: '0 12px' }}>{user.email}</span>
            <IconButton
              onClick={onSignOut}
              size="20"
              tooltip={t['404.signOut']()}
            >
              <SignOutIcon />
            </IconButton>
          </div>
        ) : null}
      </div>
    </AffineOtherPageLayout>
  );
};
