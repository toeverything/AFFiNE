export interface TagLike {
  id: string;
  name: string; // display name
  color: string; // css color value
}

export interface TagColor {
  id: string;
  value: string; // css color value
  name?: string; // display name
}
