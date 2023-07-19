import { group } from 'k6';

import { signUp } from './apis';

export const options = {
  vus: 100,
  duration: '30s',
  ext: {
    loadimpact: {
      projectID: 3633177,
      name: 'graphql test',
    },
  },
};

export default function () {
  group('sign up', () => {
    signUp(
      'test',
      `test${(Math.random() * 10000000000000) | 1}@affine.pro`,
      '1'
    );
  });
}
