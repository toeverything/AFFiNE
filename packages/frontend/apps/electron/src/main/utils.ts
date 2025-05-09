import type { CookiesSetDetails } from 'electron';

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
