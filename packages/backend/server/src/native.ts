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

export function getTokenEncoder(model?: string | null): Tokenizer | null {
  if (!model) return null;
  if (model.startsWith('gpt')) {
    return serverNativeModule.fromModelName(model);
  } else if (model.startsWith('dall')) {
    // dalle don't need to calc the token
    return null;
  } else {
    // c100k based model
    return serverNativeModule.fromModelName('gpt-4');
  }
}

export const getMime = serverNativeModule.getMime;
export const parseDoc = serverNativeModule.parseDoc;
export const htmlSanitize = serverNativeModule.htmlSanitize;
export const AFFINE_PRO_PUBLIC_KEY = serverNativeModule.AFFINE_PRO_PUBLIC_KEY;
export const AFFINE_PRO_LICENSE_AES_KEY =
  serverNativeModule.AFFINE_PRO_LICENSE_AES_KEY;
