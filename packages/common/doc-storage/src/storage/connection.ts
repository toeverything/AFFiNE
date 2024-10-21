export class Connection {
  connected = false;

  async connect() {
    this.connected = true;
  }

  async disconnect() {
    this.connected = false;
  }
}
