// eslint-disable
// @ts-nocheck
let id = 0;

export class Node {
  id = ++id;
  children: Node[];
  open: string;
  close: string;
  text: string;

  _format: string;
  _parent: Node;

  constructor(data?: string[] | string) {
    if (Array.isArray(data)) {
      this.open = data[0];
      this.close = data[1];
    } else if (typeof data === 'string') {
      this.text = data;
    }
    this.children = [];
  }

  append(e: Node) {
    if (!(e instanceof Node)) {
      e = new Node(e);
    }
    if (e._parent) {
      const idx = e._parent.children.indexOf(e);
      e._parent.children.splice(idx, 1);
    }
    e._parent = this;
    this.children = this.children.concat(e);
  }

  render() {
    const inner =
      (this.text || '') + this.children.map(c => c.render()).join('');

    if (
      inner.trim() === '' &&
      this.open === this.close &&
      this.open &&
      this.close
    ) {
      return '';
    }

    const wrapped = this.open && this.close;
    const emptyInner = inner.trim() === '';
    const fragments = [
      inner.startsWith(' ') && !emptyInner && wrapped ? ' ' : '',
      this.open,
      wrapped ? inner.trim() : inner,
      this.close,
      inner.endsWith(' ') && !emptyInner && wrapped ? ' ' : '',
    ].filter(f => f);

    return fragments.join('');
  }

  parent() {
    return this._parent;
  }
}
