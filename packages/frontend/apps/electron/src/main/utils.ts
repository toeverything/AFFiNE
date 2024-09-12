import type { CookiesSetDetails } from 'electron';

import { logger } from './logger';
import { globalStateStorage } from './shared-storage/storage';

export function parseCookie(
  cookieString: string,
  url: string
): CookiesSetDetails {
  const [nameValuePair, ...attributes] = cookieString
    .split('; ')
    .map(part => part.trim());

  const [name, value] = nameValuePair.split('=');

  const details: CookiesSetDetails = { url, name, value };

  attributes.forEach(attribute => {
    const [key, val] = attribute.split('=');

    switch (key.toLowerCase()) {
      case 'domain':
        details.domain = val;
        break;
      case 'path':
        details.path = val;
        break;
      case 'secure':
        details.secure = true;
        break;
      case 'httponly':
        details.httpOnly = true;
        break;
      case 'expires':
        details.expirationDate = new Date(val).getTime() / 1000; // Convert to seconds
        break;
      case 'samesite':
        if (
          ['unspecified', 'no_restriction', 'lax', 'strict'].includes(
            val.toLowerCase()
          )
        ) {
          details.sameSite = val.toLowerCase() as
            | 'unspecified'
            | 'no_restriction'
            | 'lax'
            | 'strict';
        }
        break;
      default:
        // Handle other cookie attributes if needed
        break;
    }
  });

  return details;
}

export const isOfflineModeEnabled = () => {
  try {
    return (
      // todo(pengx17): better abstraction for syncing flags with electron
      // packages/common/infra/src/modules/feature-flag/entities/flags.ts
      globalStateStorage.get('affine-flag:enable_offline_mode') ?? false
    );
  } catch (error) {
    logger.error('Failed to get offline mode flag', error);
    return false;
  }
};
