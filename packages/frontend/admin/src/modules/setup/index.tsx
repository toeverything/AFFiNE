import { Navigate } from 'react-router-dom';

import { useServerConfig } from '../common';
import { Form } from './form';
import logo from './logo.svg';

export function Setup() {
  const config = useServerConfig();

  if (config.initialized) {
    return <Navigate to="/admin" />;
  }

  return (
    <div className="w-full lg:grid lg:grid-cols-2 h-screen">
      <div className="flex items-center justify-center py-12 h-full">
        <Form />
      </div>
      <div className="hidden lg:block relative overflow-hidden ">
        <img
          src={logo}
          alt="Image"
          className="absolute object-right-bottom bottom-0 right-0 h-3/4"
        />
      </div>
    </div>
  );
}

export { Setup as Component };
