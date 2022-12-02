import { useState, useEffect } from 'react';
import {
  signInWithGoogle,
  onAuthStateChanged,
} from '@pathfinder/data-services';

const Login = () => {
  const [logged, setLogged] = useState(false);
  useEffect(() => {
    onAuthStateChanged(user => {
      setLogged(!!user);
    });
  }, []);
  return (
    <div>
      <h1>Login State: {String(logged)}</h1>
      <button
        onClick={() => {
          signInWithGoogle()
            .then(ret => {
              console.log('sign google', ret);
            })
            .catch(error => {
              console.log('sign google error', error);
            });
        }}
      >
        SignIn With Google
      </button>
    </div>
  );
};

export default Login;
