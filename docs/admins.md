# Admins

An admin is an account with the admin flag. Anyone can make an account at
`/entrar` with a code mailed to their email, and add a passkey from `/cuenta`.
There is no password and no invite.

## The first admin

Make an account at `/entrar`, then grant it:

```sh
bun run admin:grant --email ana@example.com --remote
```

```text
ana@example.com is an admin.
```

Without `--remote`, the script writes to the local D1. With it, the script needs
the [Cloudflare credentials](deploy.md#by-hand). It fails when no account has
that email.

## More admins

In **Ajustes** (`/admin/ajustes`), **Hacer admin** takes the email of an
account. The person must have signed in once. **Quitar** removes the flag. An
admin cannot remove their own.

## Sessions

Signing in sets the `up_session` cookie for 30 days. **Salir** in the menu ends
the session. A visitor who opens `/admin` is sent to `/entrar` and comes back
after signing in. A signed-in person who is not an admin gets a 404.

Signing in with a passkey and adding one need JavaScript; the code sign-in and
every other page work without it.
