import { notify } from '@affine/component';
import { UserFriendlyError } from '@affine/error';
import { useCallback } from 'react';
import { type NavigateOptions, type To, useNavigate } from 'react-router';

export const useAsyncNavigate = () => {
  const navigate = useNavigate();

  const nav = useCallback(
    (to: To, options?: NavigateOptions) => {
      const result = navigate(to, options);
      if (result instanceof Promise) {
        result.catch((err: Error) => {
          const error = UserFriendlyError.fromAny(err);
          console.error(error);
          notify.error(error);
        });
      }
      return;
    },
    [navigate]
  );

  return nav;
};
