import type { AxiosResponse } from 'axios';
import { ServiceError } from '../ServiceError';

export function handleResponseError(response: AxiosResponse<any, any>) {
  const { data, status } = response;
  if (status === 200) {
    if (data.error) {
      // TODO - common error handling
      const error = new ServiceError(data.error.message, data.error.code);
      throw error;
    }
    return response.data;
  }
}
