// the following apps are sorted by the name in alphabetical order
const appNameKeywords = new Set([
  'arc',
  'boardmix',
  'brave',
  'chrome',
  'chromium',
  'classin',
  'dia',
  'dingtalk',
  'discord',
  'edge',
  'facetime',
  'feishu',
  'figma',
  'firefox',
  'lark',
  'meet',
  'messenger',
  'opera',
  'qq',
  'safari',
  'skype',
  'slack',
  'telegram',
  'tim',
  'vivaldi',
  'webex',
  'wechat',
  'whatsapp',
  'wire',
  'zen',
  'zoom',
]);

export function isAppNameAllowed(name: string) {
  for (const keyword of appNameKeywords) {
    if (name.toLowerCase().includes(keyword.toLowerCase())) {
      return true;
    }
  }
  return false;
}
