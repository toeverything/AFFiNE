import { check } from 'k6';
import http from 'k6/http';

// const gql = 'https://affine.fail/graphql';
const gql = 'http://localhost:3010/graphql';

export function signUp(name: string, email: string, password: string): any {
  const response = http.post(
    gql,
    JSON.stringify({
      query: `mutation signUp($name: String!, $email: String!, $password: String!) {
          signUp(name: $name, email: $email, password: $password) {
            token { token }
          }
        }`,
      variables: { name, email, password },
    }),
    {
      headers: {
        'content-type': 'application/json',
      },
    }
  );

  check(response, {
    'status is 200': r => r.status === 200,
  });

  return response.json('data.signUp.token.token');
}

export function currentUser(token: string): any {
  const response = http.post(
    gql,
    JSON.stringify({
      query: `
          query {
            currentUser {
              id, name, email, emailVerified, avatarUrl, createdAt
            }
          }
        `,
    }),
    {
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  );

  check(response, {
    'status is 200': r => r.status === 200,
  });

  return response.json('data.currentUser');
}
