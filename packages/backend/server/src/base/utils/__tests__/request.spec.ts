import test from 'ava';
import { Request } from 'express';

import { getClientVersionFromRequest } from '../request';

test('should get client version from x-affine-version header', t => {
  const req = {
    headers: {
      'x-affine-version': '0.22.2',
    },
  } as unknown as Request;

  t.is(getClientVersionFromRequest(req), '0.22.2');

  const req2 = {
    headers: {
      'x-affine-version': ['0.22.2', '0.23.0-beta.2'],
    },
  } as unknown as Request;

  t.is(getClientVersionFromRequest(req2), '0.22.2');
});

test('should not get client version from x-affine-version header', t => {
  const req = {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.205 Safari/537.36',
    },
  } as unknown as Request;

  t.is(getClientVersionFromRequest(req), undefined);
});
