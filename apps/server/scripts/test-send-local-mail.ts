import { createTransport } from 'nodemailer';

const transport = createTransport({
  host: '0.0.0.0',
  port: 1025,
  secure: false,
  auth: {
    user: 'himself65',
    pass: '123456',
  },
});

await transport.sendMail({
  from: 'noreply@toeverything.info',
  to: 'himself65@outlook.com',
  subject: 'test',
  html: `<div>hello world</div>`,
});
