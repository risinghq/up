import {
  Map as MapLibre,
  Marker,
  setWorkerUrl,
  type ExpressionSpecification,
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
 * Draws the venue in `box` from its data-lat and data-lng. The map is a
 * picture: the link inside the box takes every click, as Luma's map does.
 */
export function showMap(box: HTMLElement) {
  const center: [number, number] = [
    Number(box.dataset.lng),
    Number(box.dataset.lat),
  ];
  const map = new MapLibre({
    container: box,
    style: styleUrl(),
    center,
    zoom: 15,
    interactive: false,
    attributionControl: { compact: true },
  });
  const pin = document.createElement("span");
  pin.className = "venue-pin";
  new Marker({ element: pin }).setLngLat(center).addTo(map);
  map.on("style.load", () => {
    for (const layer of map.getStyle().layers) {
      if (layer.type === "symbol" && layer.layout?.["text-field"])
        map.setLayoutProperty(layer.id, "text-field", localName);
    }
  });
  // The compact attribution opens at start and closes on the first drag,
  // which a map that takes no input never gets; the (i) button still opens it.
  map.once("load", () =>
    box
      .querySelector(".maplibregl-ctrl-attrib")
      ?.classList.remove("maplibregl-compact-show"),
  );
  new MutationObserver(() => map.setStyle(styleUrl())).observe(
    document.documentElement,
    { attributes: true, attributeFilter: ["class"] },
  );
}
