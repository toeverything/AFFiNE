import { HTMLRewriter } from 'htmlrewriter';

import { LinkPreviewResponse } from '../types';

export async function decodeWithCharset(
  response: Response,
  res: LinkPreviewResponse
): Promise<Response> {
  let charset: string | undefined;
  const rewriter = new HTMLRewriter()
    .on('html', {
      element(element) {
        charset = element.getAttribute('lang') || undefined;
      },
    })
    .on('meta', {
      element(element) {
        const property =
          element.getAttribute('property') ??
          element.getAttribute('name') ??
          element.getAttribute('http-equiv');
        const content = element.getAttribute('content');
        if (property && content) {
          switch (property.toLowerCase()) {
            case 'content-type':
              charset = content
                .split(';')
                .find(x => x.includes('charset='))
                ?.trim()
                ?.split('=')[1];
              break;
          }
        }
      },
    });
  const body = await rewriter.transform(response).arrayBuffer();

  try {
    if (charset) {
      const decoder = new TextDecoder(charset);
      res.charset = decoder.encoding;
      return new Response(decoder.decode(body), response);
    }
  } catch {}

  return new Response(body, response);
}
