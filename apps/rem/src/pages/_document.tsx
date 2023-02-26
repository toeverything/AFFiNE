import Document, { Head, Html, Main, NextScript } from 'next/document';
import * as React from 'react';

export default class AppDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          <meta name="theme-color" content="#fafafa" />
          <link rel="manifest" href="/manifest.json" />
          <link
            rel="apple-touch-icon"
            sizes="180x180"
            href="/apple-touch-icon.png"
          />
          <link rel="icon" sizes="192x192" href="/chrome-192x192.png" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
