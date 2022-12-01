import { initializeApp } from 'firebase/app';
import type { FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';

/**
 * Create firebase instance
 * @param firebaseConfig reference: https://firebase.google.com/docs/web/setup#add_firebase_to_your_app
 * @returns
 */
export const createInstance = (firebaseConfig: FirebaseOptions) => {
  const app = initializeApp(firebaseConfig);

  const firebaseAuth = getAuth(app);

  const signUp = (email: string, password: string) => {
    return createUserWithEmailAndPassword(firebaseAuth, email, password);
  };

  const signIn = (email: string, password: string) => {
    return signInWithEmailAndPassword(firebaseAuth, email, password);
  };

  const googleAuthProvider = new GoogleAuthProvider();
  const signInWithGoogle = () => {
    return signInWithPopup(firebaseAuth, googleAuthProvider);
  };

  return {
    signUp,
    signIn,
    signInWithGoogle,
  };
};
