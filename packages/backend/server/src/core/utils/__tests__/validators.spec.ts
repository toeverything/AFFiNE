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

  t.notThrows(() =>
    validators.assertValidCredential({
      email: 'test@example.com',
      password: 'password',
    })
  );
  t.notThrows(() =>
    validators.assertValidCredential({
      email: 'test@example.com',
      password: 'password',
      challenge: 'challenge',
    })
  );
  t.notThrows(() =>
    validators.assertValidCredential({
      email: 'test@example.com',
      password: 'password',
      verifyToken: 'verifyToken',
    })
  );
  // challenge and verifyToken should not be both provided
  t.throws(() =>
    validators.assertValidCredential({
      email: 'test@example.com',
      password: 'password',
      challenge: 'challenge',
      verifyToken: 'verifyToken',
    })
  );
});
