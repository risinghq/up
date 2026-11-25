# Email

up sends email to ticket holders through Cloudflare Email Service, from
`eventos@rising.sh` with replies to `david@rising.sh`. The `EMAIL` binding in
[`wrangler.jsonc`](../wrangler.jsonc) allows that one sender.

| Email                       | Sent when                                                                         |
| --------------------------- | --------------------------------------------------------------------------------- |
| Estás inscrito              | A registration takes a seat.                                                      |
| Estás en la lista de espera | A registration joins the waitlist.                                                |
| Tienes cupo                 | A cancellation or a raised capacity seats a waitlisted ticket.                    |
| Tu entrada                  | Someone registers again with an email that holds a ticket. Once per 15 minutes.   |
| Recordatorio                | The hourly cron finds the event within a day. Only tickets taken before that day. |

Each email carries the event's date and place in Lima time and the ticket link.
The page never shows a repeat registration its ticket link; only the email does.

A failed send is logged and never fails the request. A reminder that fails is
sent again at the next hour.

## Locally

`bun run dev` simulates the binding. The terminal prints each message's sender,
recipient and subject, and the paths of its text and HTML bodies under
`.wrangler/tmp/email/`.

The cron runs on request. The time is in milliseconds:

```sh
curl "http://localhost:5173/cdn-cgi/handler/scheduled?cron=0+*+*+*+*&time=$(date -d 2026-12-11T15:00:00Z +%s)000"
```

The tests use `outbox()` from [`tests/support.tsx`](../tests/support.tsx), a
binding that keeps every message.
