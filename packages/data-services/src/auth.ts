import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { token } from './request';

/**
 * firebaseConfig reference: https://firebase.google.com/docs/web/setup#add_firebase_to_your_app
 */
const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
});

export const firebaseAuth = getAuth(app);

const signUp = (email: string, password: string) => {
  return createUserWithEmailAndPassword(firebaseAuth, email, password);
};

const signIn = (email: string, password: string) => {
  return signInWithEmailAndPassword(firebaseAuth, email, password);
};

const googleAuthProvider = new GoogleAuthProvider();
export const signInWithGoogle = async () => {
  const user = await signInWithPopup(firebaseAuth, googleAuthProvider);
  const idToken = await user.user.getIdToken();
  await token.initToken(idToken);
};

export const onAuthStateChanged = (callback: (user: User | null) => void) => {
  firebaseAuth.onAuthStateChanged(callback);
};
