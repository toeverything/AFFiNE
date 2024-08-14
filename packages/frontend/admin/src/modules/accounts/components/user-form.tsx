import { Button } from '@affine/admin/components/ui/button';
import { Input } from '@affine/admin/components/ui/input';
import { Label } from '@affine/admin/components/ui/label';
import { Separator } from '@affine/admin/components/ui/separator';
import { Switch } from '@affine/admin/components/ui/switch';
import type { FeatureType } from '@affine/graphql';
import { CheckIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useServerConfig } from '../../common';
import type { UserInput, UserType } from '../schema';
import { useCreateUser, useUpdateUser } from './use-user-management';

type UserFormProps = {
  title: string;
  defaultValue?: Partial<UserInput>;
  onClose: () => void;
  onConfirm: (user: UserInput) => void;
  onValidate: (user: Partial<UserInput>) => boolean;
  actions?: React.ReactNode;
};

function UserForm({
  title,
  defaultValue,
  onClose,
  onConfirm,
  onValidate,
  actions,
}: UserFormProps) {
  const serverConfig = useServerConfig();

  const defaultUser: Partial<UserInput> = useMemo(
    () => ({
      name: defaultValue?.name ?? '',
      email: defaultValue?.email ?? '',
      features: defaultValue?.features ?? [],
    }),
    [defaultValue?.email, defaultValue?.features, defaultValue?.name]
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
  }, [canSave, changes, onConfirm]);

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
      <div className=" flex justify-between items-center py-[10px] px-6">
        <Button
          type="button"
          size="icon"
          className="w-7 h-7"
          variant="ghost"
          onClick={handleClose}
        >
          <XIcon size={20} />
        </Button>
        <span className="text-base font-medium">{title}</span>
        <Button
          type="submit"
          size="icon"
          className="w-7 h-7"
          variant="ghost"
          onClick={handleConfirm}
          disabled={!canSave}
        >
          <CheckIcon size={20} />
        </Button>
      </div>
      <Separator />
      <div className="p-4 flex-grow overflow-y-auto space-y-[10px]">
        <div className="flex flex-col rounded-md border py-4 gap-4">
          <InputItem
            label="Name"
            field="name"
            value={changes.name}
            onChange={setField}
          />
          <Separator />
          <InputItem
            label="Email"
            field="email"
            value={changes.email}
            onChange={setField}
          />
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
    <Label className="flex items-center justify-between px-4 py-3">
      <span>{name}</span>
      <Switch checked={checked} onCheckedChange={onToggle} />
    </Label>
  );
}

function InputItem({
  label,
  field,
  value,
  onChange,
}: {
  label: string;
  field: keyof UserInput;
  value?: string;
  onChange: (field: keyof UserInput, value: string) => void;
}) {
  const onValueChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(field, e.target.value);
    },
    [field, onChange]
  );

  return (
    <div className="px-5 space-y-3">
      <Label className="text-sm font-medium">{label}</Label>
      <Input
        type="text"
        className="py-2 px-3 text-base font-normal"
        value={value}
        onChange={onValueChange}
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
  useEffect(() => {
    if (creating) {
      return () => {
        onComplete();
      };
    }

    return;
  }, [creating, onComplete]);
  return (
    <UserForm
      title="Create User"
      onClose={onComplete}
      onConfirm={create}
      onValidate={validateCreateUser}
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
