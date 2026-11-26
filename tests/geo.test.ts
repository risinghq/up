import { describe, expect, test } from "bun:test";
import { findPlaces, locate, parsePoint, pointInUrl } from "../src/worker/geo";

describe("parsePoint", () => {
  test("reads the pair Google Maps copies", () => {
    expect(parsePoint("-12.0598607, -77.0817416")).toEqual({
      lat: -12.0598607,
      lng: -77.0817416,
    });
    expect(parsePoint(" -12.06,-77.08 ")).toEqual({ lat: -12.06, lng: -77.08 });
  });

  test("refuses text and out-of-range degrees", () => {
    expect(parsePoint("Av. Venezuela s/n")).toBeNull();
    expect(parsePoint("-120, 10")).toBeNull();
    expect(parsePoint("https://maps.app.goo.gl/x")).toBeNull();
  });
});

describe("pointInUrl", () => {
  test("prefers the place's pin to the view's center", () => {
    expect(
      pointInUrl(
        "https://www.google.com/maps/place/FCF/@-12.0500,-77.0900,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-12.0598607!4d-77.0817416",
      ),
    ).toEqual({ lat: -12.0598607, lng: -77.0817416 });
  });

  test("reads a query, a view center and an OpenStreetMap link", () => {
    expect(pointInUrl("https://maps.google.com/?q=-12.06,-77.08")).toEqual({
      lat: -12.06,
      lng: -77.08,
    });
    expect(
      pointInUrl(
        "https://www.google.com/maps/search/?api=1&query=-12.06%2C-77.08",
      ),
    ).toEqual({ lat: -12.06, lng: -77.08 });
    expect(
      pointInUrl("https://www.google.com/maps/@-12.06,-77.08,15z"),
    ).toEqual({ lat: -12.06, lng: -77.08 });
    expect(
      pointInUrl("https://www.openstreetmap.org/#map=18/-12.06/-77.08"),
    ).toEqual({ lat: -12.06, lng: -77.08 });
  });

  test("a text search carries no point", () => {
    expect(
      pointInUrl(
        "https://maps.google.com/?q=Facultad+de+Ciencias+F%C3%ADsicas",
      ),
    ).toBeNull();
  });
});

describe("locate", () => {
  test("follows a short link to the point", async () => {
    const seen: string[] = [];
    const fetcher = async (url: string) => {
      seen.push(url);
      return new Response(null, {
        status: 302,
        headers: {
          location:
            "https://www.google.com/maps/place/FCF/data=!3d-12.0598607!4d-77.0817416",
        },
      });
    };
    expect(await locate(fetcher, "https://maps.app.goo.gl/abc")).toEqual({
      lat: -12.0598607,
      lng: -77.0817416,
    });
    expect(seen).toEqual(["https://maps.app.goo.gl/abc"]);
  });

  test("fetches nothing for a long link without a point", async () => {
    const fetcher = async () => {
      throw new Error("no fetch expected");
    };
    expect(
      await locate(fetcher, "https://maps.google.com/?q=Facultad"),
    ).toBeNull();
  });
});

describe("findPlaces", () => {
  const refuse = async () => {
    throw new Error("no fetch expected");
  };

  test("offers typed coordinates and a map link's point without a search", async () => {
    expect(await findPlaces(refuse, " -12.06, -77.08 ")).toEqual([
      {
        name: "-12.06, -77.08",
        address: "",
        point: { lat: -12.06, lng: -77.08 },
      },
    ]);
    expect(
      await findPlaces(
        refuse,
        "https://www.google.com/maps/@-12.06,-77.08,15z",
      ),
    ).toEqual([
      {
        name: "Lugar del enlace",
        address: "",
        point: { lat: -12.06, lng: -77.08 },
      },
    ]);
    expect(
      await findPlaces(refuse, "https://maps.google.com/?q=Facultad"),
    ).toEqual([]);
  });

  test("searches Photon near Lima and names each place with its address", async () => {
    const seen: URL[] = [];
    const fetcher = async (url: string) => {
      seen.push(new URL(url));
      return Response.json({
        features: [
          {
            geometry: { coordinates: [-77.0817, -12.0598] },
            properties: {
              name: "Facultad de Ciencias Físicas",
              street: "Avenida Venezuela",
              housenumber: "3400",
              district: "Cercado de Lima",
              city: "Lima",
            },
          },
          {
            geometry: { coordinates: [-77.03, -12.05] },
            properties: {
              street: "Jirón Ucayali",
              district: "Lima",
              city: "Lima",
            },
          },
        ],
      });
    };

    expect(await findPlaces(fetcher, "Ciencias Físicas")).toEqual([
      {
        name: "Facultad de Ciencias Físicas",
        address: "Avenida Venezuela 3400, Cercado de Lima, Lima",
        point: { lat: -12.0598, lng: -77.0817 },
      },
      {
        name: "Jirón Ucayali",
        address: "Lima",
        point: { lat: -12.05, lng: -77.03 },
      },
    ]);
    expect(seen[0]?.origin).toBe("https://photon.komoot.io");
    expect(seen[0]?.searchParams.get("q")).toBe("Ciencias Físicas");
    expect(seen[0]?.searchParams.get("lat")).toBe("-12.06");
    expect(seen[0]?.searchParams.get("bbox")).toBe("-81.4,-18.4,-68.6,-0.03");
  });

  test("a failed search throws", async () => {
    const down = async () => new Response("", { status: 503 });
    await expect(findPlaces(down, "Facultad")).rejects.toThrow("Photon 503");
  });
});
