import { Button } from '@affine/admin/components/ui/button';
import { useMutation } from '@affine/admin/use-mutation';
import { notify } from '@affine/component';
import type { UserFriendlyError } from '@affine/error';
import { sendTestEmailMutation } from '@affine/graphql';
import { useCallback } from 'react';

import type { AppConfig } from '../config';

export function SendTestEmail({ appConfig }: { appConfig: AppConfig }) {
  const { trigger } = useMutation({
    mutation: sendTestEmailMutation,
  });

  const onClick = useCallback(() => {
    trigger(appConfig.mailer.SMTP)
      .then(() => {
        notify.success({
          title: 'Test email sent',
          message: 'The test email has been successfully sent.',
        });
      })
      .catch((err: UserFriendlyError) => {
        notify.error({
          title: 'Failed to send test email',
          message: err.message,
        });
      });
  }, [appConfig, trigger]);

  return <Button onClick={onClick}>Send Test Email</Button>;
}
