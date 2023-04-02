import { DebugLogger } from '@affine/debug';
import { config } from '@affine/env';
import {
  createUserApis,
  createWorkspaceApis,
} from '@affine/workspace/affine/api';
import { currentAffineUserAtom } from '@affine/workspace/affine/atom';
import type { LoginResponse } from '@affine/workspace/affine/login';
import { parseIdToken, setLoginStorage } from '@affine/workspace/affine/login';
import { jotaiStore } from '@affine/workspace/atom';
import {
  getMilestones,
  markMilestone,
  revertUpdate,
} from '@toeverything/y-indexeddb';

import { isValidIPAddress } from '../utils';

let prefixUrl = '/';
if (typeof window === 'undefined') {
  // SSR
  const serverAPI = config.serverAPI;
  if (isValidIPAddress(serverAPI.split(':')[0])) {
    // This is for Server side rendering support
    prefixUrl = new URL('http://' + config.serverAPI + '/').origin;
  } else {
    prefixUrl = serverAPI;
  }
} else {
  const params = new URLSearchParams(window.location.search);
  params.get('prefixUrl') && (prefixUrl = params.get('prefixUrl') as string);
}

const affineApis = {} as ReturnType<typeof createUserApis> &
  ReturnType<typeof createWorkspaceApis>;
Object.assign(affineApis, createUserApis(prefixUrl));
Object.assign(affineApis, createWorkspaceApis(prefixUrl));

const debugLogger = new DebugLogger('affine-debug-apis');

if (!globalThis.AFFINE_APIS) {
  globalThis.AFFINE_APIS = affineApis;
  globalThis.setLogin = (response: LoginResponse) => {
    jotaiStore.set(currentAffineUserAtom, parseIdToken(response.token));
    setLoginStorage(response);
  };
  const loginMockUser1 = async () => {
    const user1 = await import('@affine-test/fixtures/built-in-user1.json');
    const data = await fetch(prefixUrl + 'api/user/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'DebugLoginUser',
        email: user1.email,
        password: user1.password,
      }),
    }).then(r => r.json());
    setLogin(data);
  };
  const loginMockUser2 = async () => {
    const user2 = await import('@affine-test/fixtures/built-in-user2.json');
    const data = await fetch(prefixUrl + 'api/user/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'DebugLoginUser',
        email: user2.email,
        password: user2.password,
      }),
    }).then(r => r.json());
    setLogin(data);
  };

  globalThis.AFFINE_DEBUG = {
    loginMockUser1,
    loginMockUser2,
    markMilestone: async (name: string) => {
      if (currentWorkspace) {
        const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
        const doc = blockSuiteWorkspace.doc;
        await markMilestone(blockSuiteWorkspace.id, doc, name);
        debugLogger.info('markMilestone', name, blockSuiteWorkspace.id);
      }
    },
    listMilestone: async () => {
      if (currentWorkspace) {
        const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
        const list = await getMilestones(blockSuiteWorkspace.id);
        debugLogger.info('listMilestone', list);
      }
    },
    revertMilestone: async (name: string) => {
      if (currentWorkspace) {
        const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
        const doc = blockSuiteWorkspace.doc;
        const list = await getMilestones(blockSuiteWorkspace.id);
        if (!list) {
          debugLogger.info('no milestone');
          return;
        }
        debugLogger.info('listMilestone', list);
        const milestone = list[name];
        if (milestone) {
          revertUpdate(doc, milestone, () => 'Map');
        }
      }
    },
  };
}

declare global {
  // eslint-disable-next-line no-var
  var setLogin: typeof setLoginStorage;
  // eslint-disable-next-line no-var
  var AFFINE_APIS:
    | undefined
    | (ReturnType<typeof createUserApis> &
        ReturnType<typeof createWorkspaceApis>);
  // eslint-disable-next-line no-var
  var AFFINE_DEBUG: Record<string, unknown>;
}

export { affineApis };
