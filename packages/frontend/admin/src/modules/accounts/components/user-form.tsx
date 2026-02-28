import { Button } from '@affine/admin/components/ui/button';
import { Input } from '@affine/admin/components/ui/input';
import { Label } from '@affine/admin/components/ui/label';
import { Separator } from '@affine/admin/components/ui/separator';
import { Switch } from '@affine/admin/components/ui/switch';
import type { FeatureType } from '@affine/graphql';
import { cssVarV2 } from '@toeverything/theme/v2';
import { ChevronRightIcon } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

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
};

function UserForm({
  title,
  defaultValue,
  onClose,
  onConfirm,
  onValidate,
  actions,
  showOption,
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

  const handleConfirm = useCallback(() => {
    if (!canSave) {
      return;
    }

    // @ts-expect-error checked
    onConfirm(changes);
    setChanges(defaultUser);
  }, [canSave, changes, defaultUser, onConfirm]);

  const onFeatureChanged = useCallback(
    (feature: FeatureType, checked: boolean) => {
      setField('features', (features = []) => {
        if (checked) {
          return [...features, feature];
        }
        return features.filter(f => f !== feature);
      });
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
    <div className="flex flex-col h-full gap-1">
      <RightPanelHeader
        title={title}
        handleClose={handleClose}
        handleConfirm={handleConfirm}
        canSave={canSave}
      />
      <div className="p-4 flex-grow overflow-y-auto space-y-[8px]">
        <div className="flex flex-col rounded-md border">
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

        <div className="border rounded-md">
          {serverConfig.availableUserFeatures.map((feature, i) => (
            <div key={feature}>
              <ToggleItem
                name={feature}
                checked={changes.features?.includes(feature) ?? false}
                onChange={onFeatureChanged}
              />
              {i < serverConfig.availableUserFeatures.length - 1 && (
                <Separator />
              )}
            </div>
          ))}
        </div>
        {actions}
      </div>
    </div>
  );
}

function ToggleItem({
  name,
  checked,
  onChange,
}: {
  name: FeatureType;
  checked: boolean;
  onChange: (name: FeatureType, value: boolean) => void;
}) {
  const onToggle = useCallback(
    (checked: boolean) => {
      onChange(name, checked);
    },
    [name, onChange]
  );

  return (
    <Label className="flex items-center justify-between p-3 text-[15px] gap-2 font-medium leading-6 overflow-hidden">
      <span className="overflow-hidden text-ellipsis" title={name}>
        {name}
      </span>
      <Switch checked={checked} onCheckedChange={onToggle} />
    </Label>
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
    <div className="flex flex-col gap-1.5 p-3">
      <Label
        className="text-[15px] font-medium flex-wrap flex"
        style={{ lineHeight: '1.6rem' }}
      >
        {label}
        {optional && (
          <span
            className="font-normal ml-1"
            style={{ color: cssVarV2('text/secondary') }}
          >
            (optional)
          </span>
        )}
      </Label>
      <Input
        type="text"
        className="py-2 px-3 text-[15px] font-normal h-9"
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

export function CreateUserForm({ onComplete }: { onComplete: () => void }) {
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
    />
  );
}

export function UpdateUserForm({
  user,
  onResetPassword,
  onDeleteAccount,
  onComplete,
}: {
  user: UserType;
  onResetPassword: () => void;
  onDeleteAccount: () => void;
  onComplete: () => void;
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
      actions={
        <>
          <Button
            className="w-full flex items-center justify-between text-sm font-medium px-4 py-3"
            variant="outline"
            onClick={onResetPassword}
          >
            <span>Reset Password</span>
            <ChevronRightIcon size={16} />
          </Button>
          <Button
            className="w-full text-red-500 px-4 py-3 rounded-md flex items-center justify-between text-sm font-medium hover:text-red-500"
            variant="outline"
            onClick={onDeleteAccount}
          >
            <span>Delete Account</span>
            <ChevronRightIcon size={16} />
          </Button>
        </>
      }
    />
  );
}
