import axios from 'axios';
import { ServicesError } from './types';

const axiosInstance = axios.create({
  timeout: 1000,
  // TODO - add Authorization
  //    auth: {
  //     username: 'janedoe',
  //     password: 's00pers3cret'
  //   }
});

// TODO - repair types
axiosInstance.interceptors.response.use(response => {
  const { data, status } = response;
  if (status === 200) {
    if (data.error) {
      // TODO - common error handling
      const error = new ServicesError(data.error.message, data.error.code);
      throw error;
    }
    return response.data;
  }
});

export { axiosInstance as axios };
export default axiosInstance;
