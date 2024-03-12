import { BadRequestException } from '@nestjs/common';
import z from 'zod';

function getAuthCredentialValidator() {
  const email = z.string().email({ message: 'Invalid email address' });
  let password = z.string();

  const minPasswordLength = AFFiNE.node.prod ? 8 : 1;
  password = password
    .min(minPasswordLength, {
      message: `Password must be ${minPasswordLength} or more charactors long`,
    })
    .max(20, { message: 'Password must be 20 or fewer charactors long' });

  return z
    .object({
      email,
      password,
    })
    .required();
}

function assertValid<T>(z: z.ZodType<T>, value: unknown) {
  const result = z.safeParse(value);

  if (!result.success) {
    const firstIssue = result.error.issues.at(0);
    if (firstIssue) {
      throw new BadRequestException(firstIssue.message);
    } else {
      throw new BadRequestException('Invalid credential');
    }
  }
}

export function assertValidEmail(email: string) {
  assertValid(getAuthCredentialValidator().shape.email, email);
}

export function assertValidPassword(password: string) {
  assertValid(getAuthCredentialValidator().shape.password, password);
}

export function assertValidCredential(credential: {
  email: string;
  password: string;
}) {
  assertValid(getAuthCredentialValidator(), credential);
}

export const validators = {
  assertValidEmail,
  assertValidPassword,
  assertValidCredential,
};
