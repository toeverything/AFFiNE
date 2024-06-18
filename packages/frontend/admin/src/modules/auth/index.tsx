import { Button } from '@affine/admin/components/ui/button';
import { Input } from '@affine/admin/components/ui/input';
import { Label } from '@affine/admin/components/ui/label';
import { FeatureType, getUserFeaturesQuery } from '@affine/graphql';
import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import logo from './logo.svg';

export function Auth() {
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const login = useCallback(() => {
    if (!emailRef.current || !passwordRef.current) return;
    fetch('/api/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({
        email: emailRef.current?.value,
        password: passwordRef.current?.value,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then(() =>
        fetch('/graphql', {
          method: 'POST',
          body: JSON.stringify({
            operationName: getUserFeaturesQuery.operationName,
            query: getUserFeaturesQuery.query,
            variables: {},
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        })
      )
      .then(res => res.json())
      .then(
        ({
          data: {
            currentUser: { features },
          },
        }) => {
          if (features.includes(FeatureType.Admin)) {
            navigate('/admin');
          } else {
            toast.error('You are not an admin');
          }
        }
      )
      .catch(err => {
        toast.error(`Failed to login: ${err.message}`);
      });
  }, [navigate]);
  return (
    <div className="w-full lg:grid lg:min-h-[600px] lg:grid-cols-2 xl:min-h-[800px]">
      <div className="flex items-center justify-center py-12">
        <div className="mx-auto grid w-[350px] gap-6">
          <div className="grid gap-2 text-center">
            <h1 className="text-3xl font-bold">Login</h1>
            <p className="text-balance text-muted-foreground">
              Enter your email below to login to your account
            </p>
          </div>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                ref={emailRef}
                placeholder="m@example.com"
                required
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">Password</Label>
              </div>
              <Input id="password" type="password" ref={passwordRef} required />
            </div>
            <Button onClick={login} type="submit" className="w-full">
              Login
            </Button>
          </div>
        </div>
      </div>
      <div className="hidden bg-muted lg:block">
        <img
          src={logo}
          alt="Image"
          className="w-1/2 h-1/2 object-cover dark:brightness-[0.2] dark:grayscale relative top-1/4 left-1/4"
        />
      </div>
    </div>
  );
}

export { Auth as Component };
