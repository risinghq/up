# Add an event

An event is a file in `src/events/` and one line in
[`src/events/index.ts`](../src/events/index.ts).

```sh
cp src/events/ejemplo.tsx src/events/rust-intro.tsx
```

```tsx
import type { EventEntry } from "./types";

export const rustIntro: EventEntry = {
  meta: {
    slug: "rust-intro",
    title: "Taller: tu primer programa en Rust",
    summary: "Dos horas para escribir y compilar tu primer programa en Rust.",
    start: "2027-01-16T10:00:00-05:00",
    end: "2027-01-16T12:00:00-05:00",
    place: {
      kind: "venue",
      name: "Facultad de Ciencias Físicas, UNMSM",
      address: "Av. Venezuela s/n, Cercado de Lima",
    },
    hosts: ["David"],
    capacity: 30,
    questions: [{ id: "carrera", label: "Carrera", required: true }],
    draft: true,
  },
  Body: () => <p>Trae tu laptop con Rust instalado.</p>,
};
```

```ts
export const events: EventEntry[] = [ejemplo, rustIntro];
```

The event is served at `/<slug>`. Every registration stores the slug, so keep it
once people register.

## Fields

[`src/events/types.ts`](../src/events/types.ts) defines `EventMeta`.

| Field              | Meaning                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `slug`             | The URL path: lowercase words joined by `-`.                                                                     |
| `title`, `summary` | The page title, and the line shown in the list, link previews and calendar entries.                              |
| `start`, `end`     | ISO 8601 with the Lima offset, `-05:00`. Once `end` passes, the event moves to the past tab and its form closes. |
| `place`            | `{ kind: "venue", name, address, mapUrl? }` or `{ kind: "online", platform }`.                                   |
| `hosts`            | The names shown under "Organizan".                                                                               |
| `capacity`         | Seats. Without it, the event takes any number of registrations.                                                  |
| `cover`            | A path under `public/`, 1200×630. It is also the link preview image.                                             |
| `questions`        | Extra form fields. `options` makes a field a choice. Answers are stored as JSON keyed by `id`.                   |
| `draft`            | Serve the event only where `SHOW_DRAFTS` is set.                                                                 |
| `recordingUrl`     | Shown on the event page after the event ends.                                                                    |

## Publish

`bun run dev` serves drafts. Keep `draft: true` until the details are final,
then remove it and [deploy](deploy.md).
