import { mintChallengeResponse } from '@affine/native';

export const getChallengeResponse = async (resource: string) => {
  // 20 bits challenge is a balance between security and user experience
  // 20 bits challenge cost time is about 1-3s on m2 macbook air
  return mintChallengeResponse(resource, 20);
};
