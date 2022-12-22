import type { AxiosResponse, AxiosError } from 'axios';
import { ServiceError } from '../ServiceError';
import { refreshToken } from '../request/authorization';
import { request } from '../axios';

export async function handleResponseError(error: AxiosError<any, any>) {
  const { response, config, message } = error;
  const status = response?.status;

  if (status === 401) {
    if (!config) {
      throw new ServiceError(message, status.toString());
    }
    if (config.refreshTokenRequest) {
      throw new ServiceError(message, status.toString());
    }
    await refreshToken();
    return request({ ...config, refreshTokenRequest: true });
  }
  return error;
}

export async function handleResponse(response: AxiosResponse<any, any>) {
  const { status, data } = response;
  if (status === 200) {
    if (data.error) {
      // TODO - common error handling
      const error = new ServiceError(data.error.message, data.error.code);
      throw error;
    }
    return response;
  }
  return response;
}
