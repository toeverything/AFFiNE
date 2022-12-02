import type { AxiosRequestConfig } from 'axios';
import { firebaseAuth } from '../../auth';

export async function setAuthorization(config: AxiosRequestConfig<unknown>) {
  if (config.withAuthorization) {
    const token = await firebaseAuth.currentUser?.getIdToken();
    if (!token) {
      throw new Error('No authorization token.');
    }
    if (!config.headers) {
      config.headers = {};
    }
    config.headers['Authorization'] = token;
  }
  return config;
}
