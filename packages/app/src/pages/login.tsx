import { useRef } from 'react';
import { createInstance } from '@pathfinder/auth';

const auth = createInstance({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
});

const Login = () => {
  const email = useRef<string>();
  const password = useRef<string>();
  return (
    <div>
      <h1>Login</h1>
      <div>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="string"
            value={email.current}
            onChange={event => (email.current = event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="string"
            value={password.current}
            onChange={event => (password.current = event.target.value)}
          />
        </div>
        <div>
          <button
            onClick={async () => {
              if (email.current && password.current) {
                try {
                  const ret = await auth.signUp(
                    email.current,
                    password.current
                  );
                  console.log('signUp', ret);
                } catch (error: any) {
                  console.log('signUp error', error.code, error.message);
                }
              }
            }}
          >
            SignUp
          </button>
          <button
            onClick={async () => {
              if (email.current && password.current) {
                try {
                  const ret = await auth.signIn(
                    email.current,
                    password.current
                  );
                  console.log('signIn', ret);
                } catch (error: any) {
                  console.log('signIn error', error.code, error.message);
                }
              }
            }}
          >
            SignIn
          </button>
          <button
            onClick={() => {
              auth
                .signInWithGoogle()
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
      </div>
    </div>
  );
};

export default Login;
