import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const emailRegex =
  /^(?:(?:[^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@(?:(?:\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|((?:[a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

interface PasswordLimits {
  minLength: number;
  maxLength: number;
}

export const validateEmailAndPassword = (
  email: string,
  password: string,
  passwordLimits: PasswordLimits,
  setInvalidEmail?: (invalid: boolean) => void,
  setInvalidPassword?: (invalid: boolean) => void
) => {
  const isValidEmail = emailRegex.test(email);
  const isValidPassword =
    password.length >= passwordLimits.minLength &&
    password.length <= passwordLimits.maxLength;

  setInvalidEmail?.(!isValidEmail);
  setInvalidPassword?.(!isValidPassword);

  return isValidEmail && isValidPassword;
};
