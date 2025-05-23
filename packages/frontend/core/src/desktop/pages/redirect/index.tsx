import { Navigate, useLoaderData } from 'react-router';

export const Component = () => {
  const { allow } = useLoaderData() as { allow: boolean };

  if (allow) {
    return null;
  }

  return <Navigate to="/404" />;
};
