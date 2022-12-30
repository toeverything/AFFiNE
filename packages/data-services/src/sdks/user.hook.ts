import useSWR from 'swr';
import type { SWRConfiguration } from 'swr';
import { getUserByEmail } from './user';
import type { GetUserByEmailParams, User } from './user';

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
