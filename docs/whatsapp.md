# WhatsApp

up sends each ticket holder a WhatsApp message beside the email, through the
WhatsApp Cloud API. `WHATSAPP_PHONE_NUMBER_ID` in
[`wrangler.jsonc`](../wrangler.jsonc) picks the mode:

| Value                         | Mode        | What happens                                                                     |
| ----------------------------- | ----------- | -------------------------------------------------------------------------------- |
| unset                         | Desactivado | Nothing is sent. The tests run this way.                                         |
| `mock`                        | Simulado    | The Worker logs the message, with the phone masked and without the token.        |
| a phone number id, and secret | Conectado   | The Worker posts a template message to `graph.facebook.com/v25.0/<id>/messages`. |

Ajustes in the admin shows the mode. Production runs `mock`.

| Template          | Sent when                                                      |
| ----------------- | -------------------------------------------------------------- |
| `up_inscrito`     | A registration takes a seat.                                   |
| `up_lista_espera` | A registration joins the waitlist.                             |
| `up_cupo`         | A cancellation or a raised capacity seats a waitlisted ticket. |
| `up_recordatorio` | The hourly cron sends the [reminder](email.md).                |

A repeat registration gets its ticket link by email only. A failed message is
logged and never fails the request or blocks the email. A reminder is marked
sent by its email alone, so a failed WhatsApp reminder is not retried.

The template bodies, in Spanish, are `templates` in
[`src/worker/whatsapp.ts`](../src/worker/whatsapp.ts). `{{1}}` is the first
name, `{{2}}` the event, `{{3}}` when and `{{4}}` where. Each template has one
URL button, "Ver mi entrada", to `https://up.rising.sh/entrada/{{1}}`; its
parameter is the ticket token.

## Go live

1. In Meta Business Manager, create a WhatsApp Business account and add the
   sender number.
2. Submit the four templates in the **Utility** category, language `es`, with
   the bodies and button from `templates`.
3. Create a system user with the `whatsapp_business_messaging` permission and
   generate a permanent token for it.
4. Set the token:

   ```sh
   bunx wrangler secret put WHATSAPP_TOKEN
   ```

5. Once Meta approves the templates, set `WHATSAPP_PHONE_NUMBER_ID` in
   `wrangler.jsonc` to the number's id and deploy.

## Locally

`bun run dev` runs the `mock` mode from `wrangler.jsonc`. The terminal prints
each message as the phone would show it.
