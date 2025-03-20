import type { Writable } from "node:stream";

export enum Color {
  black = 0,
  red = 1,
  green = 2,
  yellow = 3,
  blue = 4,
  magenta = 5,
  cyan = 6,
  white = 7,
}

const colors = [
  [
    Array(8)
      .fill(null)
      .map((_, i) => String(i + 30)),
    Array(8)
      .fill(null)
      .map((_, i) => String(i + 90)),
  ],
  [
    Array(8)
      .fill(null)
      .map((_, i) => String(i + 40)),
    Array(8)
      .fill(null)
      .map((_, i) => String(i + 100)),
  ],
];

export enum Style {
  none = 0,
  fgLight = 1 << 0,
  bgLight = 1 << 1,
  bold = 1 << 2,
  dim = 1 << 3,
  italic = 1 << 4,
  underline = 1 << 5,
  overline = 1 << 6,
  strike = 1 << 7,
}

export class Terminal {
  private current: [Color, Color, Style] = [
    Color.white,
    Color.black,
    Style.fgLight,
  ];
  private next: [Color, Color, Style] = [
    Color.white,
    Color.black,
    Style.fgLight,
  ];
  private buffer: string[] = [];

  constructor(private out: Writable) {}

  checkColor(idx: 0 | 1, styleDiff: number) {
    const color = this.next[idx];
    if (this.current[idx] !== color || styleDiff & (1 << idx)) {
      const lightBit = (this.next[2] & (1 << idx)) >> idx;
      this.buffer.push("\x1B[", colors[idx][lightBit][color], "m");
      this.current[idx] = color;
    }
  }

  write(str: string) {
    const styleDiff = this.current[2] ^ this.next[2];
    this.checkColor(0, styleDiff);
    this.checkColor(1, styleDiff);
    this.current[2] = this.next[2];
    this.buffer.push(str);
    return this;
  }

  fg(color: Color) {
    this.next[0] = color;
    return this;
  }

  bg(color: Color) {
    this.next[1] = color;
    return this;
  }

  styles(styles: Style) {
    this.next[2] = styles;
    return this;
  }

  reset() {
    this.current[0] = this.next[0] = Color.white;
    this.current[1] = this.next[1] = Color.black;
    this.current[2] = this.next[2] = Style.fgLight;
    this.buffer.push("\x1B[0m");
    return this;
  }

  cls() {
    this.buffer.push("\x1Bc");
    return this;
  }

  flush() {
    this.out.write(this.buffer.join(""));
    this.buffer = [];
    return this;
  }
}
