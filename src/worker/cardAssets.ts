import layout from "satori/yoga.wasm";
import resvg from "@resvg/resvg-wasm/index_bg.wasm";
import geist400 from "./fonts/geist-400.woff?inline";
import geist600 from "./fonts/geist-600.woff?inline";
import type { CardAssets } from "./card";

const bytes = (dataUrl: string) =>
  Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (ch) =>
    ch.charCodeAt(0),
  ).buffer;

export const cardAssets: CardAssets = {
  layout,
  resvg,
  geist400: bytes(geist400),
  geist600: bytes(geist600),
};
