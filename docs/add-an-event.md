# Add an event

Sign in at `/admin` ([admins](admins.md)) and choose **Crear evento** in the
header. The editor at `/admin/eventos/nuevo` saves the event to D1, and the site
serves it at `/<slug>` right away. No deploy is needed.

`/admin` lists the events under **Próximos** and **Pasados**. **Gestionar
evento** opens `/admin/eventos/<slug>`, which has five tabs:

| Tab       | Path         | Holds                                                        |
| --------- | ------------ | ------------------------------------------------------------ |
| Resumen   | (none)       | Date and place, the link to share, the seat count, the call. |
| Inscritos | `/inscritos` | The registrant list and its CSV.                             |
| Equipo    | `/equipo`    | The people with a role. See [Team](#team).                   |
| Editar    | `/editar`    | The editor below.                                            |
| Más       | `/mas`       | **Eliminar evento**.                                         |

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
| Lugar               | A venue with a name, an address and an optional map, or online with a platform name. See [Map](#map).                                                                                     |
| Cupos               | Seats. Empty takes any number. Past the limit, people join the waitlist. Raising it seats the waitlist on save.                                                                           |
| Preguntas extra     | One question per line, up to 20. See [Questions](#questions).                                                                                                                             |
| Tipo                | Hackathon, taller, charla or meetup. It labels the card and the page, unless the title already names it.                                                                                  |
| Color               | The accent of the event's buttons, chip and cover. The text on it turns black or white for contrast.                                                                                      |
| Fondo de la portada | Plain, grid, dots or glow, drawn behind the site's mark when the event has no cover image.                                                                                                |
| Portada             | A JPG, PNG or WebP of up to 5 MB, 1200×630. It is also the link preview image. It is stored in R2 and served at `/media/covers/...`.                                                      |
| Destacar            | Opens the home page with a full-width band in the event's colors, holding its cover, title, date and button. One event at a time: featuring one unfeatures the others.                    |
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

## Map

```text
-12.0598607, -77.0817416
```

The **Mapa** field takes the coordinates Google Maps copies on a right click, or
a Google Maps link. A link that carries a point, a long one with the pin or a
short `maps.app.goo.gl` one, gives the place the same map. The page draws the
map under **Lugar** and links it to Google Maps. A search link carries no point:
the page shows a **Ver en el mapa** link instead.

## Registrants

The **Inscritos** tab opens `/admin/eventos/<slug>/inscritos`. **Descargar CSV**
exports the registrations with one column per question. The **Ingreso** column
checks a registrant in; [Check in at the door](check-in.md) covers the door.

## Team

The **Equipo** tab opens `/admin/eventos/<slug>/equipo`. **Agregar** gives a
person a role: Organiza, Ponente, Mentor, Jurado or Voluntario. The email is
optional; with it, the event appears on that person's profile. See
[Roles](profile.md#roles). **Quitar** removes a role. One person can hold
several roles at one event, each once.

## Delete

**Eliminar evento** on the **Más** tab deletes an event that has no
registrations. An event with registrations stays; set it back to draft instead.
