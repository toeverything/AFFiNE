const STAGE_HOST = 'https://nightly.affine.pro/';
if (['master', 'develop'].includes(process.env.CF_PAGES_BRANCH)) {
  const message = `Daily builds: New deployment of version ${process.env.CF_PAGES_COMMIT_SHA} was deploy: [nightly](${STAGE_HOST}) / [internal](${process.env.CF_PAGES_URL})`;
  const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: process.env.CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
      disable_notification: true,
    }),
  })
    .then(r => r.json())
    .then(console.log);
}
