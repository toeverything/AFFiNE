import useSWR from 'swr';
import type { SWRConfiguration } from 'swr';
import { login, getUserByEmail } from './user';
import type {
  LoginParams,
  LoginResponse,
  GetUserByEmailParams,
  User,
} from './user';

export const LOGIN_SWR_KEY = 'user.token';
export function useLogin(params: LoginParams, config?: SWRConfiguration) {
  const { data, error, isValidating, isLoading, mutate } =
    useSWR<LoginResponse>(
      [LOGIN_SWR_KEY, params],
      ([_, params]) => login(params),
      config
    );

  return {
    loading: isLoading,
    data,
    error,
    mutate,
  };
}

export const GET_USER_BY_EMAIL_SWR_TOKEN = 'user.getUserByEmail';
export function useGetUserByEmail(
  params: GetUserByEmailParams,
  config?: SWRConfiguration
) {
  const { data, error, isLoading, mutate } = useSWR<User | null>(
    [GET_USER_BY_EMAIL_SWR_TOKEN, params],
    ([_, params]) => getUserByEmail(params),
    config
  );

  return {
    loading: isLoading,
    data,
    error,
    mutate,
  };
}
