import QRCode from "qrcode";

/** Inline SVG for `text`. Only ever called with our own /connect URL. */
export const qrSvg = (text: string): Promise<string> =>
  QRCode.toString(text, { type: "svg", margin: 1 });
