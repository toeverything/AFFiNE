import { Button } from '@affine/admin/components/ui/button';
import { Input } from '@affine/admin/components/ui/input';
import { Label } from '@affine/admin/components/ui/label';
import { useMutateQueryResource } from '@affine/core/hooks/use-mutation';
import { useQuery } from '@affine/core/hooks/use-query';
import {
  FeatureType,
  getCurrentUserFeaturesQuery,
  getUserFeaturesQuery,
  serverConfigQuery,
} from '@affine/graphql';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import logo from './logo.svg';

export function Auth() {
  const {
    data: { currentUser },
  } = useQuery({
    query: getCurrentUserFeaturesQuery,
  });

  const {
    data: { serverConfig },
  } = useQuery({
    query: serverConfigQuery,
  });
  const revalidate = useMutateQueryResource();
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
      .then(async response => {
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Failed to login');
        }
        await revalidate(getCurrentUserFeaturesQuery);
        return response.json();
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
            toast.success('Logged in successfully');
            navigate('/admin');
          } else {
            toast.error('You are not an admin');
          }
        }
      )
      .catch(err => {
        toast.error(`Failed to login: ${err.message}`);
      });
  }, [navigate, revalidate]);

  useEffect(() => {
    if (serverConfig.initialized === false) {
      navigate('/admin/setup');
      return;
    } else if (!currentUser) {
      return;
    } else if (!currentUser?.features.includes?.(FeatureType.Admin)) {
      toast.error('You are not an admin, please login the admin account.');
      return;
    }
  }, [currentUser, navigate, serverConfig.initialized]);

  return (
    <div className="w-full lg:grid lg:min-h-[600px] lg:grid-cols-2 xl:min-h-[800px] h-screen">
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
      <div className="hidden bg-muted lg:flex lg:justify-center">
        <img
          src={logo}
          alt="Image"
          className="h-1/2 object-cover dark:brightness-[0.2] dark:grayscale relative top-1/4 "
        />
      </div>
    </div>
  );
}

export { Auth as Component };
