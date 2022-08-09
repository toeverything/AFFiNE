import got from 'got';

const STAGE_HOST = 'https://nightly.affine.pro/';
if (['master', 'develop'].includes(process.env.CF_PAGES_BRANCH)) {
    const message = `Daily builds: New deployment of Ligo-Virgo version [${process.env.CF_PAGES_COMMIT_SHA}](${STAGE_HOST}), this [${STAGE_HOST}](${STAGE_HOST}) link always points to the latest version deployment, to access the old version, please go to Github to view the deployment record.`;
    const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;

    got.post(url, {
        json: {
            chat_id: process.env.CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
            disable_notification: true,
        },
    }).then(r => console.log(r.body));
}
