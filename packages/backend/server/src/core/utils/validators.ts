import z from 'zod';

import { InvalidEmail, InvalidPasswordLength } from '../../fundamentals';

export function assertValidEmail(email: string) {
  const result = z.string().email().safeParse(email);
  if (!result.success) {
    throw new InvalidEmail();
  }
}

export function assertValidPassword(
  password: string,
  { min, max }: { min: number; max: number }
) {
  const result = z.string().min(min).max(max).safeParse(password);

  if (!result.success) {
    throw new InvalidPasswordLength({ min, max });
  }
}

export const validators = {
  assertValidEmail,
  assertValidPassword,
};
