import http from 'node:http';

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/healthz',
  method: 'GET',
};

const maxAttempts = 5;
const timeout = 1000;
let attempts = 0;

while (attempts < maxAttempts) {
  await new Promise(resolve => setTimeout(resolve, timeout * (1 << attempts)));
  await new Promise(resolve => {
    const req = http.request(options, res => {
      if (res.statusCode === 204) {
        console.log('Server is ready');
        process.exit(0);
      } else {
        console.log(`Unexpected response: ${res.statusCode}`);
      }
      resolve();
    });

    req.on('error', error => {
      console.error(error);
      resolve();
    });

    req.end();
    attempts++;
  });
}

process.exit(1);
