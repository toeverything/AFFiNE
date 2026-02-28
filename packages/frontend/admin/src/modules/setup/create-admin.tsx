import { Input } from '@affine/admin/components/ui/input';
import { Label } from '@affine/admin/components/ui/label';
import { useCallback } from 'react';

type CreateAdminProps = {
  name: string;
  email: string;
  password: string;
  invalidEmail: boolean;
  invalidPassword: boolean;
  passwordLimits: {
    minLength: number;
    maxLength: number;
  };
  onNameChange: (name: string) => void;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
};

export const CreateAdmin = ({
  name,
  email,
  password,
  invalidEmail,
  invalidPassword,
  passwordLimits,
  onNameChange,
  onEmailChange,
  onPasswordChange,
}: CreateAdminProps) => {
  const handleNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onNameChange(event.target.value);
    },
    [onNameChange]
  );
  const handleEmailChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onEmailChange(event.target.value);
    },
    [onEmailChange]
  );

  const handlePasswordChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onPasswordChange(event.target.value);
    },
    [onPasswordChange]
  );

  return (
    <div className="flex flex-col h-full w-full mt-24 max-lg:items-center max-lg:mt-16 max-md:mt-5 lg:pl-0">
      <div className="flex flex-col pl-1 max-lg:p-4 max-w-96 mb-5">
        <div className="flex flex-col mb-16 max-sm:mb-6">
          <h1 className="text-lg font-semibold">
            Create Administrator Account
          </h1>
          <p className="text-sm text-muted-foreground">
            This account can also be used to log in as an AFFiNE user.
          </p>
        </div>
        <div className="flex flex-col gap-9">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={handleNameChange}
              required
            />
          </div>
          <div className="grid gap-2 relative">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              required
            />
            <p
              className={`absolute text-sm text-red-500 -bottom-6 ${invalidEmail ? '' : 'opacity-0 pointer-events-none'}`}
            >
              Invalid email address.
            </p>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center">
              <Label htmlFor="password">Password</Label>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={handlePasswordChange}
              min={passwordLimits.minLength}
              max={passwordLimits.maxLength}
              required
            />
            <p
              className={`text-sm text-muted-foreground ${invalidPassword && 'text-red-500'}`}
            >
              {invalidPassword ? 'Invalid password. ' : ''}Please enter{' '}
              {String(passwordLimits.minLength)}-
              {String(passwordLimits.maxLength)} digit password, it is
              recommended to include 2+ of: uppercase, lowercase, numbers,
              symbols.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
