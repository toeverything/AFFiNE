// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { group } from 'k6';

import { startSync } from './sync';

export const options = {
  stages: [
    { duration: '10s', target: 20 },
    { duration: '30s', target: 20 },
    { duration: '1m', target: 20 },
    { duration: '1m', target: 20 },
    { duration: '1m', target: 20 },
  ],
  tags: {
    name: 'sync test',
    scenario: 'sync',
  },
};

export default function () {
  group('each user uses a separate room', () => {
    startSync(uuidv4());
  });

  // group('each user uses the same room', () => {
  //   startSync('test');
  // });

  // group('pre 10 user uses a separate room', () => {
  //   startSync(uuidv4());
  // })
}
