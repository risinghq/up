import {
  Map as MapLibre,
  Marker,
  setWorkerUrl,
  type ExpressionSpecification,
  type MapOptions,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

// MapLibre looks for its worker next to its own module, which the bundle
// renames; the worker ships as a separate asset instead.
setWorkerUrl(workerUrl);

// OpenFreeMap serves these styles with no key and no usage cap.
const styleUrl = () =>
  `https://tiles.openfreemap.org/styles/${
    document.documentElement.classList.contains("dark") ? "dark" : "positron"
  }`;

// The styles label in English first; Lima's streets read in Spanish.
const localName = [
  "coalesce",
  ["get", "name:es"],
  ["get", "name"],
] as ExpressionSpecification;

/**
 * A map in `box` with Spanish labels that follows the page's scheme.
 * `onFail` runs when the style or the tiles never load, as under an ad
 * blocker; the map is gone by then.
 */
export function baseMap(
  box: HTMLElement,
  options: Omit<MapOptions, "container" | "style">,
  onFail: () => void,
) {
  const map = new MapLibre({ ...options, container: box, style: styleUrl() });

  map.on("style.load", () => {
    for (const layer of map.getStyle().layers) {
      if (layer.type === "symbol" && layer.layout?.["text-field"])
        map.setLayoutProperty(layer.id, "text-field", localName);
    }
  });

  const scheme = new MutationObserver(() => map.setStyle(styleUrl()));
  scheme.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  let loaded = false;
  map.once("load", () => {
    loaded = true;
  });

  // A tile that fails after the first draw leaves only a gap.
  map.on("error", () => {
    if (loaded) return;
    scheme.disconnect();
    map.remove();
    onFail();
  });

  return map;
}

/** The venue's dot, in the event's brand color. */
export const venuePin = () => {
  const pin = document.createElement("span");
  pin.className = "venue-pin";
  return pin;
};

/**
 * Draws the venue in `box` from its data-lat and data-lng. The map is a
 * picture: the link inside the box takes every click, as Luma's map does.
 * A map that never drew leaves the page; the place row links to the map too.
 */
export function showMap(box: HTMLElement) {
  const center: [number, number] = [
    Number(box.dataset.lng),
    Number(box.dataset.lat),
  ];
  const map = baseMap(
    box,
    {
      center,
      zoom: 15,
      interactive: false,
      attributionControl: { compact: true },
    },
    () => {
      box.hidden = true;
    },
  );
  new Marker({ element: venuePin() }).setLngLat(center).addTo(map);

  // The compact attribution opens at start and closes on the first drag,
  // which a map that takes no input never gets; the (i) button still opens it.
  map.once("load", () => {
    box
      .querySelector(".maplibregl-ctrl-attrib")
      ?.classList.remove("maplibregl-compact-show");
  });
}
