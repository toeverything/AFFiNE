import axios from 'axios';
import { setAuthorization } from './request';
import { handleResponseError } from './response';

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * If true, request will send with Authorization header.
     */
    withAuthorization?: boolean;
  }
}

export const request = axios.create({
  withAuthorization: true,
});

request.interceptors.request.use(setAuthorization);
request.interceptors.response.use(handleResponseError);
