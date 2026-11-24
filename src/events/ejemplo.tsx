import type { EventEntry } from "./types";

// A draft that shows the shape of an event file. Copy it for a real event.
export const ejemplo: EventEntry = {
  meta: {
    slug: "ejemplo",
    title: "Mini hackathon: métodos de ML en física",
    summary:
      "Una tarde para resolver un problema de física con aprendizaje automático, en equipos de tres.",
    start: "2026-12-12T15:00:00-05:00",
    end: "2026-12-12T19:00:00-05:00",
    place: {
      kind: "venue",
      name: "Facultad de Ciencias Físicas, UNMSM",
      address: "Av. Venezuela s/n, Cercado de Lima",
      mapUrl:
        "https://maps.google.com/?q=Facultad+de+Ciencias+F%C3%ADsicas+UNMSM",
    },
    hosts: ["David", "Pedro"],
    capacity: 40,
    questions: [
      { id: "universidad", label: "Universidad", required: true },
      { id: "carrera", label: "Carrera", required: true },
      {
        id: "python",
        label: "¿Cuánto Python sabes?",
        required: true,
        options: ["Nada todavía", "Lo básico", "Lo uso seguido"],
      },
    ],
    draft: true,
  },
  Body: () => (
    <>
      <p>
        Formamos equipos de tres y cada equipo elige un problema: ajustar una
        curva experimental, clasificar señales o predecir una serie temporal.
      </p>
      <p>Trae tu laptop. No hace falta experiencia previa con ML.</p>
    </>
  ),
};
