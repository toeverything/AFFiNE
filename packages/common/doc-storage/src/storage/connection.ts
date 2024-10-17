export class Connection {
  protected connected: boolean = false;
  connect(): Promise<void> {
    this.connected = true;
    return Promise.resolve();
  }
  disconnect(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }
}
