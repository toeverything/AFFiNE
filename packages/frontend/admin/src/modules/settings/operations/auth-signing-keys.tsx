import { Badge } from '@affine/admin/components/ui/badge';
import { Button } from '@affine/admin/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@affine/admin/components/ui/card';
import { useMutation } from '@affine/admin/use-mutation';
import { useQuery } from '@affine/admin/use-query';
import { notify } from '@affine/component';
import type { UserFriendlyError } from '@affine/error';
import {
  authSigningKeysQuery,
  deleteAuthSigningKeyMutation,
  rotateAuthSigningKeyMutation,
} from '@affine/graphql';
import { useMemo, useState } from 'react';

import { ConfirmDialog } from '../../../components/shared/confirm-dialog';

type PendingAction =
  | { type: 'rotate'; keyId: string }
  | { type: 'delete'; keyId: string };

export function AuthSigningKeys() {
  const { data, mutate } = useQuery({ query: authSigningKeysQuery });
  const { trigger: rotate, isMutating: rotating } = useMutation({
    mutation: rotateAuthSigningKeyMutation,
  });
  const { trigger: remove, isMutating: deleting } = useMutation({
    mutation: deleteAuthSigningKeyMutation,
  });
  const [pending, setPending] = useState<PendingAction>();
  const keys = useMemo(
    () =>
      [...data.authSigningKeys].sort((left, right) =>
        left.status === right.status ? 0 : left.status === 'active' ? -1 : 1
      ),
    [data.authSigningKeys]
  );
  const active = keys.find(key => key.status === 'active');
  const mutating = rotating || deleting;

  const confirm = async () => {
    if (!pending) return;
    try {
      if (pending.type === 'rotate') {
        await rotate({ expectedActiveKeyId: pending.keyId });
        notify.success({
          title: 'Signing key rotated',
          message: 'New access tokens now use the replacement key.',
        });
      } else {
        await remove({ id: pending.keyId });
        notify.success({
          title: 'Signing key deleted',
          message: 'The expired signing key was removed.',
        });
      }
      setPending(undefined);
      await mutate();
    } catch (error) {
      const friendly = error as UserFriendlyError;
      notify.error({
        title: 'Signing key update failed',
        message: friendly.message,
      });
    }
  };

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-sm">Access token signing keys</CardTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            This server generated and stored its signing key automatically.
            Rotate it here when needed; key material is never shown in the admin
            panel.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!active || mutating}
          onClick={() => {
            if (active) setPending({ type: 'rotate', keyId: active.id });
          }}
        >
          Rotate key
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {keys.length === 0 ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            No active signing key is available. Restart the server to retry
            automatic initialization.
          </div>
        ) : (
          keys.map(key => {
            return (
              <div
                key={key.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <code className="truncate text-xs">{key.id}</code>
                    <Badge
                      variant={
                        key.status === 'active' ? 'default' : 'secondary'
                      }
                    >
                      {key.status === 'active' ? 'Active' : 'Retiring'}
                    </Badge>
                    {key.source === 'auto' ? (
                      <Badge variant="outline">Auto-generated</Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created {formatDate(key.createdAt)}
                    {key.verifyUntil
                      ? ` · Verifiable until ${formatDate(key.verifyUntil)}`
                      : ''}
                    {key.retiredAt
                      ? ` · Retired ${formatDate(key.retiredAt)}`
                      : ''}
                  </div>
                </div>
                {key.status === 'retiring' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!key.canDelete || mutating}
                    title={
                      key.canDelete
                        ? 'Delete expired key'
                        : 'This key can be deleted after its verification window ends.'
                    }
                    onClick={() =>
                      setPending({ type: 'delete', keyId: key.id })
                    }
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={open => {
          if (!open && !mutating) setPending(undefined);
        }}
        title={
          pending?.type === 'delete'
            ? 'Delete signing key?'
            : 'Rotate signing key?'
        }
        description={
          pending?.type === 'delete'
            ? 'The expired key will be permanently removed.'
            : 'A new key will become active immediately. The current key remains available only long enough to verify access tokens already issued.'
        }
        confirmText={pending?.type === 'delete' ? 'Delete key' : 'Rotate key'}
        confirmButtonVariant={
          pending?.type === 'delete' ? 'destructive' : 'default'
        }
        onConfirm={() => {
          confirm().catch(console.error);
        }}
      />
    </Card>
  );
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'Unknown';
}
