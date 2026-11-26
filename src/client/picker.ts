import { Marker, NavigationControl, type LngLat } from "maplibre-gl";
import { baseMap, venuePin } from "./map";

type Found = {
  name: string;
  address: string;
  point: { lat: number; lng: number };
};

// Central Lima, where a venue without a point starts.
const LIMA: [number, number] = [-77.04, -12.06];

/**
 * The editor's place picker: a search box over a map. A result or a click
 * on the map drops the pin, a drag moves it, and the pin writes the form's
 * lat and lng fields.
 */
export function showPicker(field: HTMLElement) {
  const form = field.closest("form");
  const lat = field.querySelector<HTMLInputElement>("input[name=lat]");
  const lng = field.querySelector<HTMLInputElement>("input[name=lng]");
  const coords = field.querySelector<HTMLElement>(".place-coords");
  const search = field.querySelector<HTMLElement>(".place-search");
  const box = field.querySelector<HTMLElement>(".place-map");
  const clear = field.querySelector<HTMLButtonElement>(".place-clear");
  if (!form || !lat || !lng || !coords || !search || !box || !clear) return;

  coords.hidden = true;
  search.hidden = false;
  box.hidden = false;

  const start: [number, number] | null =
    lat.value && lng.value ? [Number(lng.value), Number(lat.value)] : null;
  const map = baseMap(
    box,
    {
      center: start ?? LIMA,
      zoom: start ? 16 : 11,
      scrollZoom: false,
      attributionControl: { compact: true },
    },
    () => {
      search.hidden = true;
      box.hidden = true;
      clear.hidden = true;
      coords.hidden = false;
    },
  );
  map.addControl(new NavigationControl({ showCompass: false }));

  let pin: Marker | null = null;

  const write = (at: LngLat | { lat: number; lng: number }) => {
    lat.value = at.lat.toFixed(6);
    lng.value = at.lng.toFixed(6);
  };

  const place = (at: { lat: number; lng: number }) => {
    if (!pin) {
      const element = venuePin();
      element.classList.add("place-pin");
      pin = new Marker({ element, draggable: true }).setLngLat(at).addTo(map);
      pin.on("dragend", () => pin && write(pin.getLngLat()));
    } else {
      pin.setLngLat(at);
    }
    write(at);
    clear.hidden = false;
  };

  if (start) place({ lng: start[0], lat: start[1] });

  map.on("click", (event) => place(event.lngLat));

  clear.addEventListener("click", () => {
    pin?.remove();
    pin = null;
    lat.value = "";
    lng.value = "";
    clear.hidden = true;
  });

  const choose = (found: Found) => {
    place(found.point);
    map.flyTo({ center: found.point, zoom: 16 });
    const fill = (name: string, value: string) => {
      const input = form.querySelector<HTMLInputElement>(`input[name=${name}]`);
      if (input && !input.value.trim() && value) input.value = value;
    };
    fill("place_address", found.address);
    if (found.address) fill("place_name", found.name);
  };

  wireSearch(search, choose);
}

/** The combobox: a debounced query to the Worker and a keyboard listbox. */
function wireSearch(search: HTMLElement, choose: (found: Found) => void) {
  const input = search.querySelector<HTMLInputElement>("input");
  const list = search.querySelector<HTMLUListElement>("[role=listbox]");
  if (!input || !list) return;

  let results: Found[] = [];
  let active = -1;
  let asked = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };

  const mark = () => {
    for (const [i, item] of [...list.children].entries())
      item.setAttribute("aria-selected", String(i === active));
    if (active >= 0)
      input.setAttribute("aria-activedescendant", `a-place-${active}`);
    else input.removeAttribute("aria-activedescendant");
  };

  const pick = (i: number) => {
    const found = results[i];
    if (!found) return;
    input.value = found.address
      ? `${found.name}, ${found.address}`
      : found.name;
    close();
    choose(found);
  };

  const note = (text: string) => {
    results = [];
    const item = document.createElement("li");
    item.className = "place-note";
    item.textContent = text;
    list.replaceChildren(item);
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  const show = (found: Found[]) => {
    if (!found.length)
      return note("Sin resultados. Prueba otro nombre o haz clic en el mapa.");
    results = found;
    active = -1;
    list.replaceChildren(
      ...found.map((place, i) => {
        const item = document.createElement("li");
        item.id = `a-place-${i}`;
        item.setAttribute("role", "option");
        const name = document.createElement("strong");
        name.textContent = place.name;
        const address = document.createElement("span");
        address.textContent = place.address;
        item.replaceChildren(name, ...(place.address ? [address] : []));
        // mousedown keeps the focus in the box until the click picks.
        item.addEventListener("mousedown", (event) => event.preventDefault());
        item.addEventListener("click", () => pick(i));
        return item;
      }),
    );
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    mark();
  };

  const ask = async (query: string) => {
    const mine = ++asked;
    try {
      const res = await fetch(`/admin/lugares?q=${encodeURIComponent(query)}`);
      const body = (await res.json()) as { places?: Found[]; error?: string };
      if (mine !== asked) return;
      if (!res.ok) note(body.error ?? "La búsqueda no respondió.");
      else show(body.places ?? []);
    } catch {
      if (mine === asked) note("La búsqueda no respondió.");
    }
  };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < 3) {
      asked++;
      close();
      return;
    }
    timer = setTimeout(() => void ask(query), 300);
  });

  input.addEventListener("keydown", (event) => {
    const open = !list.hidden && results.length > 0;
    if (event.key === "Enter") {
      // Enter in the box picks a place; it never submits the editor.
      event.preventDefault();
      if (open) pick(active >= 0 ? active : 0);
    } else if (event.key === "Escape" && !list.hidden) {
      event.preventDefault();
      close();
    } else if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      active = (active + step + results.length) % results.length;
      mark();
    }
  });

  input.addEventListener("blur", close);
}
