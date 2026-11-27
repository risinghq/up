# Accounts

A person signs in at `/sign-in` with their email. The site mails a 6-digit code,
and typing it opens a session. An email with no account asks for a name and the
privacy consent, then makes the account. There is no password.

```text
/sign-in → Revisa tu correo → (Crea tu cuenta) → /account
```

A code lasts 10 minutes and takes 5 tries. One address gets one code a minute.
The page answers the same whether or not the email has an account. With both
Turnstile keys set, the email form asks Turnstile whether it is a person, as the
register form does.

`/sign-in?next=/path` returns the person to that path after signing in. A value
that is not a path on this site returns them to `/account`.

## The account page

`/account` shows:

- **Tus entradas**: the tickets under the account, each linking to its ticket
  page.
- **Tus datos**: name and WhatsApp number.
- **Correo**: adds or changes the email with a code sent to the new address.
- **Perfil público**: opens or hides the public profile; see
  [Profile and badges](profile.md).
- **Passkeys**: adds a passkey on this device, or removes one. An account
  without an email cannot remove its last passkey.

**Entrar con passkey** on `/sign-in` signs in without a code. It needs
JavaScript.

## Registrations and accounts

A registration names a person by email. When the signed-in account holds that
email, the registration updates its name and phone. Otherwise it keeps the
stored ones and only adds a phone where none was set, so a stranger who types
someone's email cannot rename them.

An account without an email that proves one held by an earlier registrant takes
over that person: their tickets, phone and consent move to the account. An
account that already has an email cannot take another person's.
