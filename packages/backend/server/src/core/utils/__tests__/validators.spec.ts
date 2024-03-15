import test from 'ava';

import { validators } from '../validators';

test('can validate', t => {
  t.notThrows(() => validators.assertValidEmail('test@example.com'));
  t.throws(() => validators.assertValidEmail('test@example'));
  t.throws(() => validators.assertValidEmail('test'));

  t.notThrows(() => validators.assertValidPassword('password'));
  t.notThrows(() => validators.assertValidPassword('a'));
  t.throws(() => validators.assertValidPassword(''));
  t.throws(() => validators.assertValidPassword('aaaaaaaaaaaaaaaaaaaaa'));

  // verify with captcha
  t.notThrows(() =>
    validators.assertValidCredential({
      email: 'test@example.com',
      password: 'password',
      token: 'captchaToken',
    })
  );
  // verify with challenge
  t.notThrows(() =>
    validators.assertValidCredential({
      email: 'test@example.com',
      password: 'password',
      token: 'verifyToken',
      challenge: 'challenge',
    })
  );
  t.throws(() =>
    validators.assertValidCredential({
      email: 'test@example.com',
      password: 'password',
      challenge: 'challenge',
    })
  );
});
