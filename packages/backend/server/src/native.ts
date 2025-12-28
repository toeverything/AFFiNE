import serverNativeModule, { type Tokenizer } from '@affine/server-native';

export const mergeUpdatesInApplyWay = serverNativeModule.mergeUpdatesInApplyWay;

export const verifyChallengeResponse = async (
  response: any,
  bits: number,
  resource: string
) => {
  if (typeof response !== 'string' || !response || !resource) return false;
  return serverNativeModule.verifyChallengeResponse(response, bits, resource);
};

export const mintChallengeResponse = async (resource: string, bits: number) => {
  if (!resource) return null;
  return serverNativeModule.mintChallengeResponse(resource, bits);
};

const ENCODER_CACHE = new Map<string, Tokenizer>();

export function getTokenEncoder(model?: string | null): Tokenizer | null {
  if (!model) return null;
  const cached = ENCODER_CACHE.get(model);
  if (cached) return cached;
  if (model.startsWith('gpt')) {
    const encoder = serverNativeModule.fromModelName(model);
    if (encoder) ENCODER_CACHE.set(model, encoder);
    return encoder;
  } else if (model.startsWith('dall')) {
    // dalle don't need to calc the token
    return null;
  } else {
    // c100k based model
    const encoder = serverNativeModule.fromModelName('gpt-4');
    if (encoder) ENCODER_CACHE.set('gpt-4', encoder);
    return encoder;
  }
}

export const getMime = serverNativeModule.getMime;
export const parseDoc = serverNativeModule.parseDoc;
export const htmlSanitize = serverNativeModule.htmlSanitize;
export const parseYDocFromBinary = serverNativeModule.parseDocFromBinary;
export const parseYDocToMarkdown = serverNativeModule.parseDocToMarkdown;
export const readAllDocIdsFromRootDoc =
  serverNativeModule.readAllDocIdsFromRootDoc;
export const AFFINE_PRO_PUBLIC_KEY = serverNativeModule.AFFINE_PRO_PUBLIC_KEY;
export const AFFINE_PRO_LICENSE_AES_KEY =
  serverNativeModule.AFFINE_PRO_LICENSE_AES_KEY;
