import { initWasm, Resvg } from "@resvg/resvg-wasm";
import satori, { init as initSatori } from "satori/standalone";
import { cardColors } from "../pages/theme";
import { kindTag, type EventMeta } from "./events";
import { clock, longDate } from "./time";

/** What the renderer loads: its two WebAssembly modules and Geist. */
export type CardAssets = {
  layout: WebAssembly.Module;
  resvg: WebAssembly.Module;
  geist400: ArrayBuffer;
  geist600: ArrayBuffer;
};

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

// Each module initializes once per isolate; a second init throws.
let ready: Promise<void> | undefined;
const init = (assets: CardAssets) =>
  (ready ??= Promise.all([
    initSatori(assets.layout),
    initWasm(assets.resvg),
  ]).then(() => undefined));

function Card(props: { firstName: string; event: EventMeta; ended: boolean }) {
  const { event } = props;
  const c = cardColors(event.theme);
  const tag = kindTag(event);
  const place =
    event.place.kind === "venue" ? event.place.name : event.place.platform;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: c.ground,
        color: c.text,
        fontFamily: "Geist",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 30, color: c.soft }}>up.rising.sh</span>
        {tag && (
          <span
            style={{
              fontSize: 26,
              padding: "6px 20px",
              borderRadius: 999,
              border: `2px solid ${c.soft}`,
              color: c.soft,
            }}
          >
            {tag}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 40, color: c.soft, marginBottom: 16 }}>
          {props.firstName} {props.ended ? "fue a" : "va a"}
        </span>
        <span
          style={{
            fontSize: 76,
            fontWeight: 600,
            lineHeight: 1.08,
            letterSpacing: -2,
            lineClamp: 3,
          }}
        >
          {event.title}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", fontSize: 32 }}>
        <span>
          {longDate(event.start)} · {clock(event.start)}
        </span>
        <span style={{ color: c.soft }}>{place}</span>
      </div>
    </div>
  );
}

/** A 1200×630 PNG that says the person is going, or went, to the event. */
export async function renderCard(
  assets: CardAssets,
  firstName: string,
  event: EventMeta,
  ended: boolean,
): Promise<Uint8Array> {
  await init(assets);
  const card = <Card firstName={firstName} event={event} ended={ended} />;
  const svg = await satori(card, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: [
      { name: "Geist", data: assets.geist400, weight: 400, style: "normal" },
      { name: "Geist", data: assets.geist600, weight: 600, style: "normal" },
    ],
  });
  return new Resvg(svg).render().asPng();
}
