export const emailTemplate = ({
  title,
  content,
  buttonContent,
  buttonUrl,
}: {
  title: string;
  content: string;
  buttonContent: string;
  buttonUrl: string;
}) => {
  return `<body style="background: #f6f7fb; overflow: hidden">
      <table
        width="100%"
        border="0"
        cellpadding="24px"
        style="
          background: #fff;
          max-width: 450px;
          margin: 32px auto 0 auto;
          border-radius: 16px 16px 0 0;
          box-shadow: 0px 0px 20px 0px rgba(66, 65, 73, 0.04);
        "
      >
        <tr>
          <td>
            <a href="https://affine.pro" target="_blank">
              <img
                src="https://cdn.affine.pro/mail/2023-8-9/affine-logo.png"
                alt="AFFiNE log"
                height="32px"
              />
            </a>
          </td>
        </tr>
        <tr>
          <td
            style="
              font-size: 20px;
              font-weight: 600;
              line-height: 28px;
              font-family: inter, Arial, Helvetica, sans-serif;
              color: #444;
              padding-top: 0;
            "
          >${title}</td>
        </tr>
        <tr>
          <td
            style="
              font-size: 15px;
              font-weight: 400;
              line-height: 24px;
              font-family: inter, Arial, Helvetica, sans-serif;
              color: #444;
              padding-top: 0;
            "
          >${content}</td>
        </tr>
        <tr>
          <td style="margin-left: 24px; padding-top: 0; padding-bottom: 64px">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td style="border-radius: 8px" bgcolor="#1E96EB">
                  <a
                    href="${buttonUrl}"
                    target="_blank"
                    style="
                      font-size: 15px;
                      font-family: inter, Arial, Helvetica, sans-serif;
                      font-weight: 600;
                      line-height: 24px;
                      color: #fff;
                      text-decoration: none;
                      border-radius: 8px;
                      padding: 8px 18px;
                      border: 1px solid #1e96eb;
                      display: inline-block;
                      font-weight: bold;
                    "
                    >${buttonContent}</a
                  >
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <table
        width="100%"
        border="0"
        style="
          background: #fafafa;
          max-width: 450px;
          margin: 0 auto 32px auto;
          border-radius: 0 0 16px 16px;
          box-shadow: 0px 0px 20px 0px rgba(66, 65, 73, 0.04);
          padding: 20px;
        "
      >
        <tr align="center">
          <td>
            <table cellpadding="0">
              <tr>
                <td style="padding: 0 10px">
                  <a
                    href="https://github.com/toeverything/AFFiNE"
                    target="_blank"
                    ><img
                      src="https://cdn.affine.pro/mail/2023-8-9/Github.png"
                      alt="AFFiNE github link"
                      height="16px"
                  /></a>
                </td>
                <td style="padding: 0 10px">
                  <a href="https://twitter.com/AffineOfficial" target="_blank">
                    <img
                      src="https://cdn.affine.pro/mail/2023-8-9/Twitter.png"
                      alt="AFFiNE twitter link"
                      height="16px"
                    />
                  </a>
                </td>
                <td style="padding: 0 10px">
                  <a href="https://discord.gg/Arn7TqJBvG" target="_blank"
                    ><img
                      src="https://cdn.affine.pro/mail/2023-8-9/Discord.png"
                      alt="AFFiNE discord link"
                      height="16px"
                  /></a>
                </td>
                <td style="padding: 0 10px">
                  <a href="https://www.youtube.com/@affinepro" target="_blank"
                    ><img
                      src="https://cdn.affine.pro/mail/2023-8-9/Youtube.png"
                      alt="AFFiNE youtube link"
                      height="16px"
                  /></a>
                </td>
                <td style="padding: 0 10px">
                  <a href="https://t.me/affineworkos" target="_blank"
                    ><img
                      src="https://cdn.affine.pro/mail/2023-8-9/Telegram.png"
                      alt="AFFiNE telegram link"
                      height="16px"
                  /></a>
                </td>
                <td style="padding: 0 10px">
                  <a href="https://www.reddit.com/r/Affine/" target="_blank"
                    ><img
                      src="https://cdn.affine.pro/mail/2023-8-9/Reddit.png"
                      alt="AFFiNE reddit link"
                      height="16px"
                  /></a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr align="center">
          <td
            style="
              font-size: 12px;
              font-weight: 400;
              line-height: 20px;
              font-family: inter, Arial, Helvetica, sans-serif;
              color: #8e8d91;
              padding-top: 8px;
            "
          >
            One hyper-fused platform for wildly creative minds
          </td>
        </tr>
        <tr align="center">
          <td
            style="
              font-size: 12px;
              font-weight: 400;
              line-height: 20px;
              font-family: inter, Arial, Helvetica, sans-serif;
              color: #8e8d91;
              padding-top: 8px;
            "
          >
            Copyright<img
              src="https://cdn.affine.pro/mail/2023-8-9/copyright.png"
              alt="copyright"
              height="14px"
              style="vertical-align: middle; margin: 0 4px"
            />2023 Toeverything
          </td>
        </tr>
      </table>
    </body>`;
};
