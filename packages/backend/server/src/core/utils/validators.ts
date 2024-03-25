import { BadRequestException } from '@nestjs/common';
import z from 'zod';

function getAuthCredentialValidator() {
  const email = z.string().email({ message: 'Invalid email address' });
  let password = z.string();

  password = password
    .min(AFFiNE.auth.password.minLength, {
      message: `Password must be ${AFFiNE.auth.password.minLength} or more charactors long`,
    })
    .max(AFFiNE.auth.password.maxLength, {
      message: `Password must be ${AFFiNE.auth.password.maxLength} or fewer charactors long`,
    });

  return z
    .object({
      email,
      password,
      token: z.string(),
      challenge: z.string().optional(),
    })
    .strict();
}

function assertValid<T>(z: z.ZodType<T>, value: unknown): T {
  const result = z.safeParse(value);

  if (!result.success) {
    const firstIssue = result.error.issues.at(0);
    if (firstIssue) {
      throw new BadRequestException(firstIssue.message);
    } else {
      throw new BadRequestException('Invalid credential');
    }
  }
  return result.data;
}

export function assertValidEmail(email: string) {
  return assertValid(getAuthCredentialValidator().shape.email, email);
}

export function assertValidPassword(password: string) {
  return assertValid(getAuthCredentialValidator().shape.password, password);
}

export function assertValidCredential(
  credential: Omit<Credential, 'token'> & { token?: string }
) {
  return assertValid(getAuthCredentialValidator(), credential);
}

export type Credential = z.infer<ReturnType<typeof getAuthCredentialValidator>>;

export const validators = {
  assertValidEmail,
  assertValidPassword,
  assertValidCredential,
};
