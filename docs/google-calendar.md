# Google Calendar and Meet

The admin can create each event in one Google account's calendar, with a Google
Meet call. A registrant with a seat sees **Entrar a la llamada en Google Meet**
on their ticket. The event page, a waitlisted ticket and a cancelled ticket do
not show the link. Nobody is invited from Google, so Google sends no email.

## Set up the OAuth client

The feature stays hidden until the Worker has both secrets:

```sh
bunx wrangler secret put GOOGLE_CLIENT_ID
bunx wrangler secret put GOOGLE_CLIENT_SECRET
```

They come from a Google Cloud project with the Google Calendar API enabled and
an OAuth client of type **Web application** whose authorized redirect URI is
`https://up.rising.sh/admin/google/vuelta`. The consent screen asks for the
`openid`, `email` and `calendar.events` scopes.

## Connect the account

In **Ajustes** (`/admin/ajustes`), **Conectar Google** opens Google's consent
page. After consent, Ajustes names the connected account. One account serves the
whole site; connecting another replaces it. **Desconectar** revokes the access
and forgets the account; events already in its calendar stay there.

## Create an event's call

On the event's **Resumen** tab, **Crear en Google Calendar con Meet** creates
the entry in the account's primary calendar and shows the Meet link and the
calendar link.

| Action                    | Effect in Google                                             |
| ------------------------- | ------------------------------------------------------------ |
| **Guardar** the event     | Updates the entry's title, description, place and times.     |
| **Sincronizar**           | The same, and creates the entry again if someone deleted it. |
| **Quitar del calendario** | Deletes the entry and its call.                              |
| **Eliminar evento**       | Deletes the entry too.                                       |

When Google refuses a save's update, the event still saves and the editor says
the calendar did not change. **Sincronizar** retries.
