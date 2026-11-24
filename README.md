<a href="https://rising.sh"><picture><source media="(prefers-color-scheme: dark)" srcset="https://rising.sh/brand/rising-sh-dark.svg"><img alt="rising.sh" src="https://rising.sh/brand/rising-sh-light.svg" height="28"></picture></a>

# up

up is the events site of rising.sh, served at
[up.rising.sh](https://up.rising.sh). It lists the events, takes registrations
with a WhatsApp number, and gives each registrant a private ticket link. Admins
create and theme events at `/admin`. It is a Cloudflare Worker that renders
Preact on the server and stores events and registrations in D1. The site is in
Spanish.

```sh
bun install
bun run db:migrate:local
bun run admin:invite --name Ana
bun run dev
```

Open the printed invite link, create a passkey, and add an event from
`http://localhost:5173/admin`.

## Features

- Upcoming and past events, each with link preview tags for WhatsApp and
  Instagram.
- A register form that works without JavaScript and asks each event's own
  questions.
- A private ticket page at `/entrada/<token>` with calendar links and
  cancellation.
- A capacity per event. Registrations past it join a waitlist, and a
  cancellation gives the seat to the oldest waitlisted person.
- Google Calendar links and an `.ics` file per event, in Lima time.
- An optional Google Calendar connection that creates each event with a Google
  Meet call, shown on the tickets that hold a seat.
- Recorded consent: the privacy policy is required and WhatsApp news is opt-in.
- An admin area with passkey sign-in: upcoming and past events, a page per event
  with its seat count and share link, an editor with a kind, an accent color, a
  backdrop, a cover and a featured spot on the home page, a registrant list with
  CSV export, and settings for admin invites and the Google account.

## More

- [Manual](docs/README.md)
- [Architecture](docs/architecture.md)
