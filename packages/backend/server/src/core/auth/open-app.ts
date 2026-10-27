import { Injectable } from '@nestjs/common';

import { InvalidAuthState } from '../../base';
import { BackendRuntimeProvider } from '../backend-runtime';
import type { CurrentUser } from './session';
import type { NativeLoginResult, SessionIssueInput } from './session-issuer';

@Injectable()
export class OpenAppAuthService {
  constructor(private readonly runtime: BackendRuntimeProvider) {}

  async createSignInCode(user: CurrentUser) {
    return await this.runtime.executeAuthSessionCommandV1<string>({
      action: 'create_open_app_code',
      userId: user.id,
    });
  }

  async complete(
    code: string,
    issue: SessionIssueInput
  ): Promise<NativeLoginResult> {
    try {
      return await this.runtime.executeAuthSessionCommandV1<NativeLoginResult>({
        action: 'complete_open_app',
        code,
        issue,
      });
    } catch {
      throw new InvalidAuthState();
    }
  }
}
