import axios from 'axios';
import { setAuthorization } from './request';
import { handleResponseError, handleResponse } from './response';

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * If true, request will send with Authorization header.
     */
    withAuthorization?: boolean;
    /**
     * If true, indicate this request is refreshing token.
     */
    refreshTokenRequest?: boolean;
  }
}

export const request = axios.create({
  withAuthorization: true,
});

request.interceptors.request.use(setAuthorization);
request.interceptors.response.use(handleResponse, handleResponseError);
