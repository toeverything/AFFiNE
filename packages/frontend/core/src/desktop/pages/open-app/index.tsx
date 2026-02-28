import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { GraphQLService } from '@affine/core/modules/cloud';
import { OpenInAppPage } from '@affine/core/modules/open-in-app/views/open-in-app-page';
import {
  appSchemaUrl,
  appSchemes,
  channelToScheme,
} from '@affine/core/utils/channel';
import type { GetCurrentUserQuery } from '@affine/graphql';
import { getCurrentUserQuery } from '@affine/graphql';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { AppContainer } from '../../components/app-container';

const OpenUrl = () => {
  const [params] = useSearchParams();
  const urlToOpen = params.get('url');
  const navigateHelper = useNavigateHelper();

  const onOpenHere = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      navigateHelper.jumpToIndex();
    },
    [navigateHelper]
  );

  const parsed = appSchemaUrl.safeParse(urlToOpen);
  if (!parsed.success) {
    console.error(parsed.error);
    return null;
  }

  const urlObj = new URL(parsed.data);
  params.forEach((v, k) => {
    if (k === 'url') {
      return;
    }
    urlObj.searchParams.set(k, v);
  });

  return (
    <OpenInAppPage urlToOpen={urlObj.toString()} openHereClicked={onOpenHere} />
  );
};

/**
 * @deprecated
 */
const OpenOAuthJwt = () => {
  const [currentUser, setCurrentUser] = useState<
    GetCurrentUserQuery['currentUser'] | null
  >(null);
  const [params] = useSearchParams();
  const graphqlService = useService(GraphQLService);

  const maybeScheme = appSchemes.safeParse(params.get('scheme'));
  const scheme = maybeScheme.success
    ? maybeScheme.data
    : channelToScheme[BUILD_CONFIG.appBuildType];
  const next = params.get('next') || '';

  useEffect(() => {
    graphqlService
      .gql({
        query: getCurrentUserQuery,
      })
      .then(res => {
        setCurrentUser(res?.currentUser || null);
      })
      .catch(console.error);
  }, [graphqlService]);

  if (!currentUser || !currentUser?.token?.sessionToken) {
    return <AppContainer fallback />;
  }

  const urlToOpen = `${scheme}://signin-redirect?token=${
    currentUser.token.sessionToken
  }&next=${next}`;

  return <OpenInAppPage urlToOpen={urlToOpen} />;
};

export const Component = () => {
  const params = useParams<{ action: string }>();
  const action = params.action || '';

  if (action === 'url') {
    return <OpenUrl />;
  } else if (action === 'signin-redirect') {
    return <OpenOAuthJwt />;
  }
  return null;
};
