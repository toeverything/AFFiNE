export type LinkPreviewRequest = {
  url: string;
  head?: boolean;
};

export type LinkPreviewResponse = {
  url: string;
  title?: string;
  siteName?: string;
  description?: string;
  images?: string[];
  mediaType?: string;
  contentType?: string;
  charset?: string;
  videos?: string[];
  favicons?: string[];
};
