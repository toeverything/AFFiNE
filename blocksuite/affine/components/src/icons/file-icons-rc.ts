import {
  FileIconAepIcon,
  FileIconAiIcon,
  FileIconAviIcon,
  FileIconCssIcon,
  FileIconCsvIcon,
  FileIconDmgIcon,
  FileIconDocIcon,
  FileIconDocxIcon,
  FileIconEpsIcon,
  FileIconExeIcon,
  FileIconFigIcon,
  FileIconGifIcon,
  FileIconHtmlIcon,
  FileIconInddIcon,
  FileIconJavaIcon,
  FileIconJpegIcon,
  FileIconJsIcon,
  FileIconJsonIcon,
  FileIconMkvIcon,
  FileIconMp3Icon,
  FileIconMp4Icon,
  FileIconMpegIcon,
  FileIconNoneIcon,
  FileIconPdfIcon,
  FileIconPngIcon,
  FileIconPptIcon,
  FileIconPptxIcon,
  FileIconPsdIcon,
  FileIconRarIcon,
  FileIconRssIcon,
  FileIconSqlIcon,
  FileIconSvgIcon,
  FileIconTiffIcon,
  FileIconTxtIcon,
  FileIconWavIcon,
  FileIconWebpIcon,
  FileIconXlsIcon,
  FileIconXlsxIcon,
  FileIconXmlIcon,
  FileIconZipIcon,
  ImageIcon,
} from '@blocksuite/icons/rc';

export function getAttachmentFileIconRC(filetype: string) {
  switch (filetype) {
    case 'img':
      return ImageIcon;
    case 'image/jpeg':
    case 'jpg':
    case 'jpeg':
      return FileIconJpegIcon;
    case 'image/png':
    case 'png':
      return FileIconPngIcon;
    case 'image/webp':
    case 'webp':
      return FileIconWebpIcon;
    case 'image/tiff':
    case 'tiff':
      return FileIconTiffIcon;
    case 'image/gif':
    case 'gif':
      return FileIconGifIcon;
    case 'image/svg':
    case 'svg':
      return FileIconSvgIcon;
    case 'image/eps':
    case 'eps':
      return FileIconEpsIcon;
    case 'application/pdf':
    case 'pdf':
      return FileIconPdfIcon;
    case 'application/msword':
    case 'application/x-iwork-pages-sffpages':
    case 'doc':
      return FileIconDocIcon;
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'docx':
      return FileIconDocxIcon;
    case 'text/plain':
    case 'txt':
      return FileIconTxtIcon;
    case 'csv':
      return FileIconCsvIcon;
    case 'application/vnd.ms-excel':
    case 'xls':
      return FileIconXlsIcon;
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/x-iwork-numbers-sffnumbers':
    case 'xlsx':
      return FileIconXlsxIcon;
    case 'application/vnd.ms-powerpoint':
    case 'application/x-iwork-keynote-sffkeynote':
    case 'ppt':
      return FileIconPptIcon;
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    case 'pptx':
      return FileIconPptxIcon;
    case 'application/illustrator':
    case 'fig':
      return FileIconFigIcon;
    case 'application/postscript':
    case 'ai':
      return FileIconAiIcon;
    case 'application/vnd.adobe.photoshop':
    case 'psd':
      return FileIconPsdIcon;
    case 'application/vnd.adobe.indesign':
    case 'indd':
      return FileIconInddIcon;
    case 'application/vnd.adobe.afterfx':
    case 'aep':
      return FileIconAepIcon;
    case 'audio/mpeg':
    case 'audio/mp3':
    case 'mp3':
      return FileIconMp3Icon;
    case 'audio/wav':
    case 'wav':
      return FileIconWavIcon;
    case 'video/mpeg':
    case 'mpeg':
      return FileIconMpegIcon;
    case 'video/mp4':
    case 'mp4':
      return FileIconMp4Icon;
    case 'video/avi':
    case 'avi':
      return FileIconAviIcon;
    case 'video/mkv':
    case 'mkv':
      return FileIconMkvIcon;
    case 'text/html':
    case 'html':
      return FileIconHtmlIcon;
    case 'text/css':
    case 'css':
      return FileIconCssIcon;
    case 'application/rss+xml':
    case 'rss':
      return FileIconRssIcon;
    case 'application/sql':
    case 'sql':
      return FileIconSqlIcon;
    case 'application/javascript':
    case 'js':
      return FileIconJsIcon;
    case 'application/json':
    case 'json':
      return FileIconJsonIcon;
    case 'application/java':
    case 'java':
      return FileIconJavaIcon;
    case 'application/xml':
    case 'xml':
      return FileIconXmlIcon;
    case 'application/x-msdos-program':
    case 'exe':
      return FileIconExeIcon;
    case 'application/x-apple-diskimage':
    case 'dmg':
      return FileIconDmgIcon;
    case 'application/zip':
    case 'zip':
      return FileIconZipIcon;
    case 'application/x-rar-compressed':
    case 'rar':
      return FileIconRarIcon;
    default:
      return FileIconNoneIcon;
  }
}
