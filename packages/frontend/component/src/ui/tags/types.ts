export interface TagLike {
  id: string;
  value: string; // value is the tag name
  color: string; // css color value
}

export interface TagColor {
  id: string;
  value: string; // css color value
  name?: string; // display name
}
