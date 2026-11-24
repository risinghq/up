# Admins

An admin signs in at `/admin/entrar` with a passkey and has no password. A new
admin needs an invite link. The link works once and expires after 7 days.

## The first admin

```sh
bun run admin:invite --name David --remote
```

```text
https://up.rising.sh/admin/invitacion/3q2…
One use, expires 2026-12-01T15:04:05.000Z.
```

Open the link and choose **Crear mi passkey**. The browser creates the passkey
and the site opens the dashboard. Without `--remote`, the script writes to the
local D1 and prints a `localhost` link. With it, the script needs the
[Cloudflare credentials](deploy.md#by-hand).

## More admins

On the dashboard, **Invitar a un admin** takes a name and shows the invite link
to send. Every admin can invite.

## Sessions

Sign-in sets the `up_admin` cookie for 30 days. **Salir** on the dashboard ends
the session. Signing in and creating a passkey need JavaScript; every other
admin page works without it.
