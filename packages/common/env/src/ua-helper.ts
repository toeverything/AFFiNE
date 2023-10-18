import { assertExists } from '@blocksuite/global/utils';

export class UaHelper {
  private uaMap;
  public isLinux = false;
  public isMacOs = false;
  public isSafari = false;
  public isWindows = false;
  public isFireFox = false;
  public isMobile = false;
  public isChrome = false;
  public isIOS = false;

  getChromeVersion = (): number => {
    const raw = this.navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);
    assertExists(raw);
    return parseInt(raw[2], 10);
  };

  constructor(private readonly navigator: Navigator) {
    this.uaMap = getUa(navigator);
    this.initUaFlags();
  }

  public checkUseragent(isUseragent: keyof ReturnType<typeof getUa>) {
    return Boolean(this.uaMap[isUseragent]);
  }

  private initUaFlags() {
    this.isLinux = this.checkUseragent('linux');
    this.isMacOs = this.checkUseragent('mac');
    this.isSafari = this.checkUseragent('safari');
    this.isWindows = this.checkUseragent('win');
    this.isFireFox = this.checkUseragent('firefox');
    this.isMobile = this.checkUseragent('mobile');
    this.isChrome = this.checkUseragent('chrome');
    this.isIOS = this.checkUseragent('ios');
  }
}

const getUa = (navigator: Navigator) => {
  const ua = navigator.userAgent;
  const uas = ua.toLowerCase();
  const mobile = /iPhone|iPad|iPod|Android/i.test(ua);
  const android =
    (mobile && (uas.indexOf('android') > -1 || uas.indexOf('linux') > -1)) ||
    uas.indexOf('adr') > -1;
  const ios = mobile && !android && /Mac OS/i.test(ua);
  const mac = !mobile && /Mac OS/i.test(ua);
  const iphone = ios && uas.indexOf('iphone') > -1;
  const ipad = ios && !iphone;
  const wx = /MicroMessenger/i.test(ua);
  const chrome = /CriOS/i.test(ua) || /Chrome/i.test(ua);
  const tiktok = mobile && /aweme/i.test(ua);
  const weibo = mobile && /Weibo/i.test(ua);
  const safari =
    ios && !chrome && !wx && !weibo && !tiktok && /Safari|Macintosh/i.test(ua);
  const firefox = /Firefox/.test(ua);
  const win = /windows|win32|win64|wow32|wow64/.test(uas);
  const linux = /linux/.test(uas);
  return {
    ua,
    mobile,
    android,
    ios,
    mac,
    wx,
    chrome,
    iphone,
    ipad,
    safari,
    tiktok,
    weibo,
    win,
    linux,
    firefox,
  };
};
