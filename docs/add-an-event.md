# Add an event

Sign in at `/admin` ([admins](admins.md)) and choose **Nuevo evento**. The
editor at `/admin/eventos/nuevo` saves the event to D1, and the site serves it
at `/<slug>` right away. No deploy is needed.

A new event starts as a draft. Admins see a draft on the site and visitors
get 404. Set **Estado** to **Publicado** to list it.

## Fields

[`parseEventForm`](../src/worker/eventForm.ts) checks every field and returns
the form with a message per field when one is wrong.

| Field               | Meaning                                                                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Título              | The page title. Up to 120 characters.                                                                                                                                                     |
| Dirección           | The slug: lowercase words joined by `-`, up to 60 characters. `admin`, `entrada`, `privacidad`, `media` and `assets` are taken. Once the event has registrations, the slug cannot change. |
| Resumen             | The line in the list, link previews and calendar entries. Up to 300 characters.                                                                                                           |
| Descripción         | Markdown, shown under "Sobre el evento". Raw HTML is escaped.                                                                                                                             |
| Inicio, Fin         | Lima time. Once the end passes, the event moves to the past tab and its form closes.                                                                                                      |
| Lugar               | A venue with a name, an address and an optional map link, or online with a platform name.                                                                                                 |
| Organizan           | Names separated by commas.                                                                                                                                                                |
| Cupos               | Seats. Empty takes any number. Past the limit, people join the waitlist. Raising it seats the waitlist on save.                                                                           |
| Preguntas extra     | One question per line, up to 20. See [Questions](#questions).                                                                                                                             |
| Tipo                | Hackathon, taller, charla or meetup. It sets the chip on the card and the page.                                                                                                           |
| Color               | The accent of the event's buttons, chip and cover. The text on it turns black or white for contrast.                                                                                      |
| Fondo de la portada | Plain, grid, dots or glow, drawn behind the title when the event has no cover image.                                                                                                      |
| Portada             | A JPG, PNG or WebP of up to 5 MB, 1200×630. It is also the link preview image. It is stored in R2 and served at `/media/covers/...`.                                                      |
| Destacar            | Leads the home page with a large card. One event at a time: featuring one unfeatures the others.                                                                                          |
| Estado              | Borrador or Publicado.                                                                                                                                                                    |
| Grabación           | A link shown on the event page after the event ends.                                                                                                                                      |

## Questions

```text
Carrera*
¿Cuánto Python sabes?: Nada | Algo | Bastante
```

A trailing `*` makes a question required. `Label: A | B | C` makes it a choice.
The answer is stored under the slugified label, so renaming a question starts a
new column in the registrants export.

## Registrants

The inscritos link on the dashboard or the editor opens
`/admin/eventos/<slug>/inscritos`. **Descargar CSV** exports the registrations
with one column per question.

## Delete

**Eliminar evento** at the bottom of the editor deletes an event that has no
registrations. An event with registrations stays; set it back to draft instead.
