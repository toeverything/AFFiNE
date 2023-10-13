import { mintChallengeResponse } from '@affine/native';

export const getChallengeResponse = (resource: string) => {
  // 22 bits challenge is a balance between security and user experience
  // 22 bits challenge cost time is about 2-6s on m2 macbook air
  return mintChallengeResponse(resource, 22);
};
