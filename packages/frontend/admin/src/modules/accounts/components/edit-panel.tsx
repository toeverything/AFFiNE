import { Button } from '@affine/admin/components/ui/button';
import { Input } from '@affine/admin/components/ui/input';
import { Label } from '@affine/admin/components/ui/label';
import { Separator } from '@affine/admin/components/ui/separator';
import { Switch } from '@affine/admin/components/ui/switch';
import { FeatureType } from '@affine/graphql';
import { CheckIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useRightPanel } from '../../layout';
import type { User } from '../schema';
import { useUserManagement } from './use-user-management';

interface EditPanelProps {
  user: User;
  onResetPassword: () => void;
  onDeleteAccount: () => void;
}

export function EditPanel({
  user,
  onResetPassword,
  onDeleteAccount,
}: EditPanelProps) {
  const { closePanel } = useRightPanel();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [features, setFeatures] = useState(user.features);
  const { updateUser } = useUserManagement();

  const disableSave =
    name === user.name && email === user.email && features === user.features;

  const onConfirm = useCallback(() => {
    updateUser({
      userId: user.id,
      name,
      email,
      features,
      callback: closePanel,
    });
  }, [closePanel, email, features, name, updateUser, user.id]);

  const onEarlyAccessChange = useCallback(
    (checked: boolean) => {
      if (checked) {
        setFeatures([...features, FeatureType.AIEarlyAccess]);
      } else {
        setFeatures(features.filter(f => f !== FeatureType.AIEarlyAccess));
      }
    },
    [features]
  );

  const onAdminChange = useCallback(
    (checked: boolean) => {
      if (checked) {
        setFeatures([...features, FeatureType.Admin]);
      } else {
        setFeatures(features.filter(f => f !== FeatureType.Admin));
      }
    },
    [features]
  );

  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
    setFeatures(user.features);
  }, [user]);

  return (
    <div className="flex flex-col h-full gap-1">
      <div className=" flex justify-between items-center py-[10px] px-6 ">
        <Button
          type="button"
          size="icon"
          className="w-7 h-7"
          variant="ghost"
          onClick={closePanel}
        >
          <XIcon size={20} />
        </Button>
        <span className="text-base font-medium">Edit Account</span>
        <Button
          type="submit"
          size="icon"
          className="w-7 h-7"
          variant="ghost"
          onClick={onConfirm}
          disabled={disableSave}
        >
          <CheckIcon size={20} />
        </Button>
      </div>
      <Separator />
      <div className="p-4 flex-grow overflow-y-auto space-y-[10px]">
        <div className="flex flex-col rounded-md border py-4 gap-4">
          <div className="px-5 space-y-3">
            <Label className="text-sm font-medium">Name</Label>
            <Input
              type="text"
              className="py-2 px-3 text-base font-normal"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <Separator />
          <div className="px-5 space-y-3">
            <Label className="text-sm font-medium">Email</Label>
            <Input
              type="email"
              className="py-2 px-3 ext-base font-normal"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
        </div>
        <Button
          className="w-full flex items-center justify-between text-sm font-medium px-4 py-3"
          variant="outline"
          onClick={onResetPassword}
        >
          <span>Reset Password</span>
          <ChevronRightIcon size={16} />
        </Button>
        <div className="border rounded-md">
          <Label className="flex items-center justify-between px-4 py-3">
            <span>Enable AI Access</span>
            <Switch
              checked={features.includes(FeatureType.AIEarlyAccess)}
              onCheckedChange={onEarlyAccessChange}
            />
          </Label>
          <Separator />
          <Label className="flex items-center justify-between px-4 py-3">
            <span>Admin</span>
            <Switch
              checked={features.includes(FeatureType.Admin)}
              onCheckedChange={onAdminChange}
            />
          </Label>
        </div>
        <Button
          className="w-full text-red-500 px-4 py-3 rounded-md flex items-center justify-between text-sm font-medium hover:text-red-500"
          variant="outline"
          onClick={onDeleteAccount}
        >
          <span>Delete Account</span>
          <ChevronRightIcon size={16} />
        </Button>
      </div>
    </div>
  );
}
