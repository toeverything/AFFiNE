interface Window {
  affine: {
    send(channel: string, ...args: any[]): void;
    invoke(channel: string, ...args: any[]): Promise<any>;
    on(
      channel: string,
      listener: (event: unknown, ...args: any[]) => void
    ): this;
    once(
      channel: string,
      listener: (event: unknown, ...args: any[]) => void
    ): this;
    removeListener(channel: string, listener: (...args: any[]) => void): this;
  };

  appInfo: {
    electron: bool;
  };
}
