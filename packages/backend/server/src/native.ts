import serverNativeModule from '@affine/server-native';

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

export const getMime = serverNativeModule.getMime;
export const parseDoc = serverNativeModule.parseDoc;
export const Tokenizer = serverNativeModule.Tokenizer;
export const fromModelName = serverNativeModule.fromModelName;
export const htmlSanitize = serverNativeModule.htmlSanitize;
export const AFFINE_PRO_PUBLIC_KEY = serverNativeModule.AFFINE_PRO_PUBLIC_KEY;
export const AFFINE_PRO_LICENSE_AES_KEY =
  serverNativeModule.AFFINE_PRO_LICENSE_AES_KEY;
