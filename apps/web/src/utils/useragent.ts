export function getUaHelper() {
  let uaHelper = null;
  (function (navigator) {
    const getUa = () => {
      const ua = navigator.userAgent;
      const uas = ua.toLowerCase();
      const mobile =
        /mobile|tablet|ip(ad|hone|od)|android/i.test(ua) ||
        (uas.indexOf('safari') > -1 &&
          /Mac OS/i.test(ua) &&
          /Macintosh/i.test(ua));
      const android =
        (mobile &&
          (uas.indexOf('android') > -1 || uas.indexOf('linux') > -1)) ||
        uas.indexOf('adr') > -1;
      const ios = mobile && !android && /Mac OS/i.test(ua);
      const iphone = ios && uas.indexOf('iphone') > -1;
      const ipad = ios && !iphone;
      const wx = /MicroMessenger/i.test(ua);
      const chrome = /CriOS/i.test(ua) || /Chrome/i.test(ua);
      const tiktok = mobile && /aweme/i.test(ua);
      const weibo = mobile && /Weibo/i.test(ua);
      const safari =
        ios &&
        !chrome &&
        !wx &&
        !weibo &&
        !tiktok &&
        /Safari|Macintosh/i.test(ua);
      const firefox = /Firefox/.test(ua);
      const win = /windows|win32|win64|wow32|wow64/.test(uas);
      const linux = /linux/.test(uas);
      return {
        ua,
        mobile,
        android,
        ios,
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

    class UaHelper {
      private uaMap;
      public isLinux = false;
      public isMacOs = false;
      public isSafari = false;
      public isWindows = false;
      public isFireFox = false;

      constructor() {
        this.uaMap = getUa();
        this.initUaFlags();
      }

      public checkUseragent(isUseragent: keyof ReturnType<typeof getUa>) {
        return Boolean(this.uaMap[isUseragent]);
      }

      private initUaFlags() {
        this.isLinux = this.checkUseragent('linux');
        this.isMacOs = this.checkUseragent('ios');
        this.isSafari = this.checkUseragent('safari');
        this.isWindows = this.checkUseragent('win');
        this.isFireFox = this.checkUseragent('firefox');
      }
    }
    uaHelper = new UaHelper();
  })(navigator);

  return uaHelper;
}
