import { AccessToken } from '@prisma/client';

import { ActionForbidden } from '../../base';
import { DocAction } from '../permission';

type AccessTokenDocScope = {
  workspaceId?: unknown;
  docId?: unknown;
  actions?: unknown;
};

type AccessTokenScopes = {
  docs?: unknown;
};

export function assertAccessTokenCanUseDocAction(
  token: AccessToken | undefined,
  workspaceId: string,
  docId: string,
  action: DocAction
) {
  if (!token?.scopes) {
    return;
  }

  const scopes = token.scopes as AccessTokenScopes;
  const docs = Array.isArray(scopes.docs) ? scopes.docs : [];
  const allowed = docs.some(scope => {
    const docScope = scope as AccessTokenDocScope;
    if (docScope.workspaceId !== workspaceId) {
      return false;
    }
    if (typeof docScope.docId === 'string' && docScope.docId !== docId) {
      return false;
    }
    const actions = Array.isArray(docScope.actions) ? docScope.actions : [];
    return actions.includes(action);
  });

  if (!allowed) {
    throw new ActionForbidden('Access token scope does not allow this action');
  }
}
