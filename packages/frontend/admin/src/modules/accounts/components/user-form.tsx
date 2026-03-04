import { Button } from '@affine/admin/components/ui/button';
import { Input } from '@affine/admin/components/ui/input';
import { Label } from '@affine/admin/components/ui/label';
import { Separator } from '@affine/admin/components/ui/separator';
import type { FeatureType } from '@affine/graphql';
import { ChevronRightIcon } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { FeatureToggleList } from '../../../components/shared/feature-toggle-list';
import { useServerConfig } from '../../common';
import { RightPanelHeader } from '../../header';
import type { UserInput, UserType } from '../schema';
import { validateEmails, validatePassword } from '../utils/csv-utils';
import { useCreateUser, useUpdateUser } from './use-user-management';

type UserFormProps = {
  title: string;
  defaultValue?: Partial<UserInput>;
  onClose: () => void;
  onConfirm: (user: UserInput) => void;
  onValidate: (user: Partial<UserInput>) => boolean;
  actions?: React.ReactNode;
  showOption?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
};

function UserForm({
  title,
  defaultValue,
  onClose,
  onConfirm,
  onValidate,
  actions,
  showOption,
  onDirtyChange,
}: UserFormProps) {
  const serverConfig = useServerConfig();

  const defaultUser: Partial<UserInput> = useMemo(
    () => ({
      name: defaultValue?.name ?? '',
      email: defaultValue?.email ?? '',
      password: defaultValue?.password ?? '',
      features: defaultValue?.features ?? [],
    }),
    [defaultValue]
  );

  const [changes, setChanges] = useState<Partial<UserInput>>(defaultUser);

  const setField = useCallback(
    <K extends keyof UserInput>(
      field: K,
      value: UserInput[K] | ((prev: UserInput[K] | undefined) => UserInput[K])
    ) => {
      setChanges(changes => ({
        ...changes,
        [field]:
          typeof value === 'function' ? value(changes[field] as any) : value,
      }));
    },
    []
  );

  const canSave = useMemo(() => {
    return onValidate(changes);
  }, [onValidate, changes]);

  useEffect(() => {
    const normalize = (value: Partial<UserInput>) => ({
      name: value.name ?? '',
      email: value.email ?? '',
      password: value.password ?? '',
      features: [...(value.features ?? [])].sort(),
    });
    const current = normalize(changes);
    const baseline = normalize(defaultUser);
    const dirty =
      (current.name !== baseline.name ||
        current.email !== baseline.email ||
        current.password !== baseline.password ||
        current.features.join(',') !== baseline.features.join(',')) &&
      !!onDirtyChange;
    onDirtyChange?.(dirty);
  }, [changes, defaultUser, onDirtyChange]);

  const handleConfirm = useCallback(() => {
    if (!canSave) {
      return;
    }

    // @ts-expect-error checked
    onConfirm(changes);
    setChanges(defaultUser);
  }, [canSave, changes, defaultUser, onConfirm]);

  const handleFeaturesChange = useCallback(
    (features: FeatureType[]) => {
      setField('features', features);
    },
    [setField]
  );

  const handleClose = useCallback(() => {
    setChanges(defaultUser);
    onClose();
  }, [defaultUser, onClose]);

  useEffect(() => {
    setChanges(defaultUser);
  }, [defaultUser]);

  return (
    <div className="flex h-full flex-col bg-background">
      <RightPanelHeader
        title={title}
        handleClose={handleClose}
        handleConfirm={handleConfirm}
        canSave={canSave}
      />
      <div className="flex-grow space-y-3 overflow-y-auto p-4">
        <div className="flex flex-col rounded-xl border border-border bg-card shadow-sm">
          <InputItem
            label="User name"
            field="name"
            value={changes.name}
            onChange={setField}
            placeholder="Enter user name"
          />
          <Separator />
          <InputItem
            label="Email"
            field="email"
            value={changes.email}
            onChange={setField}
            placeholder="Enter email address"
          />
          {showOption && (
            <>
              <Separator />
              <InputItem
                label="Password"
                field="password"
                value={changes.password}
                onChange={setField}
                optional
                placeholder="Enter password"
              />
            </>
          )}
        </div>

        <FeatureToggleList
          className="rounded-xl border border-border bg-card shadow-sm"
          features={serverConfig.availableUserFeatures}
          selected={changes.features ?? []}
          onChange={handleFeaturesChange}
          control="switch"
          controlPosition="right"
          showSeparators={true}
        />
        {actions}
      </div>
    </div>
  );
}

function InputItem({
  label,
  field,
  optional,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  field: keyof UserInput;
  optional?: boolean;
  value?: string;
  onChange: (field: keyof UserInput, value: string) => void;
  placeholder?: string;
}) {
  const onValueChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(field, e.target.value);
    },
    [field, onChange]
  );

  return (
    <div className="flex flex-col gap-2 p-3">
      <Label className="flex flex-wrap text-xs font-medium leading-5 text-muted-foreground uppercase tracking-wide">
        {label}
        {optional && (
          <span className="ml-1 font-normal text-muted-foreground">
            (optional)
          </span>
        )}
      </Label>
      <Input
        type="text"
        className="py-2 px-3 text-sm font-normal h-9"
        value={value}
        onChange={onValueChange}
        placeholder={placeholder}
      />
    </div>
  );
}

const validateCreateUser = (user: Partial<UserInput>) => {
  return !!user.name && !!user.email && !!user.features;
};

const validateUpdateUser = (user: Partial<UserInput>) => {
  return !!user.name || !!user.email;
};

export function CreateUserForm({
  onComplete,
  onDirtyChange,
}: {
  onComplete: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { create, creating } = useCreateUser();
  const serverConfig = useServerConfig();
  const passwordLimits = serverConfig.credentialsRequirement.password;
  useEffect(() => {
    if (creating) {
      return () => {
        onComplete();
      };
    }

    return;
  }, [creating, onComplete]);

  const handleCreateUser = useCallback(
    (user: UserInput) => {
      const emailValidation = validateEmails([user]);
      const passwordValidation = validatePassword(
        user.password,
        passwordLimits
      );
      if (!passwordValidation.valid || !emailValidation[0].valid) {
        toast.error(passwordValidation.error || emailValidation[0].error);
        return;
      }
      create(user);
    },
    [create, passwordLimits]
  );

  return (
    <UserForm
      title="Create User"
      onClose={onComplete}
      onConfirm={handleCreateUser}
      onValidate={validateCreateUser}
      showOption={true}
      onDirtyChange={onDirtyChange}
    />
  );
}

export function UpdateUserForm({
  user,
  onResetPassword,
  onDeleteAccount,
  onComplete,
  onDirtyChange,
}: {
  user: UserType;
  onResetPassword: () => void;
  onDeleteAccount: () => void;
  onComplete: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { update, updating } = useUpdateUser();

  const onUpdateUser = useCallback(
    (updates: UserInput) => {
      update({
        ...updates,
        userId: user.id,
      });
    },
    [user, update]
  );

  useEffect(() => {
    if (updating) {
      return () => {
        onComplete();
      };
    }
    return;
  }, [updating, onComplete]);

  return (
    <UserForm
      title="Update User"
      defaultValue={user}
      onClose={onComplete}
      onConfirm={onUpdateUser}
      onValidate={validateUpdateUser}
      onDirtyChange={onDirtyChange}
      actions={
        <div className="space-y-2">
          <Button
            className="h-10 w-full justify-between rounded-xl border-border/60 px-4 text-sm font-medium hover:bg-muted/50"
            variant="outline"
            onClick={onResetPassword}
          >
            <span>Reset Password</span>
            <ChevronRightIcon size={16} className="text-muted-foreground" />
          </Button>
          <Button
            className="h-10 w-full justify-between rounded-xl border-destructive/30 px-4 text-sm font-medium text-destructive hover:bg-destructive/5 hover:text-destructive"
            variant="outline"
            onClick={onDeleteAccount}
          >
            <span>Delete Account</span>
            <ChevronRightIcon size={16} />
          </Button>
        </div>
      }
    />
  );
}
