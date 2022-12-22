import axios from 'axios';
import { getToken, isAccessTokenExpired, refreshToken } from './token';

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * If true, indicate this request is refreshing token.
     */
    refreshTokenRequest?: boolean;
  }
}

export const request = axios.create();

request.interceptors.request.use(async config => {
  if (!config.headers) {
    config.headers = {};
  }

  const token = getToken();
  if (token) {
    if (isAccessTokenExpired(token.accessToken)) {
      await refreshToken();
    }
    if (!config.headers) {
      config.headers = {};
    }
    config.headers['Authorization'] = token.accessToken;
  }

  return config;
});
request.interceptors.response.use(
  response => {
    const { status, data } = response;
    if (status === 200) {
      if (data.error) {
        // TODO - common error handling
        throw new Error(data.error.message, { cause: data.error.code });
      }
      return response;
    }
    return response;
  },
  async error => {
    const { response, config, message } = error;
    const status = response?.status;

    if (status === 401) {
      if (!config) {
        throw new Error(message, { cause: status.toString() });
      }
      if (config.refreshTokenRequest) {
        throw new Error(message, { cause: status.toString() });
      }
      await refreshToken();
      return request({ ...config, refreshTokenRequest: true });
    }
    return response;
  }
);
