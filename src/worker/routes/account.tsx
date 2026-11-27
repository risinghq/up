import { Hono } from "hono";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { AccountPage, type AccountNotice } from "../../pages/Account";
import { accountByEmail, claimEmail, type Account } from "../accounts";
import {
  addCredential,
  findCredential,
  listPasskeys,
  removeCredential,
  saveChallenge,
  takeChallenge,
} from "../auth";
import { checkCode, requestCode } from "../codes";
import { emptyForm, normalizePhone, type FormState } from "../form";
import {
  registrationOptions,
  relyingParty,
  verifyRegistration,
} from "../passkeys";
import { phoneOf, updateContact } from "../people";
import { closeProfile, openProfile, profileIdOf } from "../profiles";
import { ticketsOf } from "../registrations";
import { accountRoles } from "../roles";
import type { AppEnv, Ctx, Deps } from "../web";
import {
  codeStep,
  emailError,
  json,
  mailCode,
  nameError,
  retry,
  sameOrigin,
  text,
  view,
  wrongCode,
} from "./accountPages";

const accountNotices: AccountNotice[] = [
  "details",
  "email",
  "passkey",
  "passkey-removed",
  "profile",
];

const takenEmail =
  "Ese correo ya es de otra cuenta. Entra con él y agrega desde ahí lo que necesites.";

/** The signed-in person's page at /account: contact, email, profile and passkeys. */
export function accountRoutes({ now }: Deps) {
  const routes = new Hono<AppEnv>();
  const iso = () => now().toISOString();
  const rp = (c: Ctx) => relyingParty(c.env.SITE_URL);

  const guard = async (c: Ctx, next: () => Promise<void>) => {
    if (c.get("account")) return next();
    return c.redirect(
      retry(c.req.method === "GET" ? c.req.path : "/account"),
      303,
    );
  };
  for (const path of ["/account", "/account/*"]) {
    routes.use(path, sameOrigin);
    routes.use(path, guard);
  }

  const signedIn = (c: Ctx) => c.get("account") as Account;

  const accountPage = async (
    c: Ctx,
    forms: { contact?: FormState; emailForm?: FormState } = {},
    status = 200,
  ) => {
    const account = signedIn(c);
    const notice =
      accountNotices.find((n) => n === c.req.query("notice")) ?? null;
    return view(
      c,
      "Tu cuenta",
      <AccountPage
        name={account.name}
        email={account.email}
        admin={account.admin}
        contact={
          forms.contact ?? {
            values: {
              name: account.name,
              phone: (await phoneOf(c.var.db, account.id)) ?? "",
            },
            errors: {},
          }
        }
        emailForm={forms.emailForm ?? emptyForm}
        tickets={await ticketsOf(c.var.db, account.id, now())}
        roles={await accountRoles(c.var.db, account.id, now())}
        profileId={await profileIdOf(c.var.db, account.id)}
        passkeys={await listPasskeys(c.var.db, account.id)}
        notice={notice}
      />,
      status,
    );
  };

  const emailRefused = (c: Ctx, email: string, error: string) =>
    accountPage(
      c,
      { emailForm: { values: { email }, errors: { email: error } } },
      422,
    );

  routes.get("/account", (c) => accountPage(c));

  routes.post("/account", async (c) => {
    const form = await c.req.formData();
    const name = text(form, "name");
    const rawPhone = text(form, "phone");
    const phone = rawPhone ? normalizePhone(rawPhone) : null;

    const errors: Record<string, string> = {};
    const badName = nameError(name);
    if (badName) errors.name = badName;
    if (rawPhone && !phone)
      errors.phone = "Escribe un número de WhatsApp, por ejemplo 987 654 321.";
    if (Object.keys(errors).length)
      return accountPage(
        c,
        { contact: { values: { name, phone: rawPhone }, errors } },
        422,
      );

    await updateContact(c.var.db, signedIn(c).id, { name, phone }, iso());
    return c.redirect("/account?notice=details", 303);
  });

  routes.post("/account/email", async (c) => {
    const account = signedIn(c);
    const email = text(await c.req.formData(), "email").toLowerCase();

    const invalid = emailError(email);
    if (invalid) return emailRefused(c, email, invalid);
    if (email === account.email)
      return emailRefused(c, email, "Ya entras con ese correo.");

    const holder = await accountByEmail(c.var.db, email);
    if (holder && account.email) return emailRefused(c, email, takenEmail);

    const code = await requestCode(c.var.db, email, account.id, iso());
    if (code) await mailCode(c, email, code, "add-email");
    return codeStep(c, {
      email,
      next: "/account",
      notice: code ? "sent" : "cooldown",
      forAccount: true,
    });
  });

  routes.post("/account/email/code", async (c) => {
    const account = signedIn(c);
    const form = await c.req.formData();
    const email = text(form, "email").toLowerCase();

    const result = await checkCode(
      c.var.db,
      email,
      text(form, "code"),
      account.id,
      iso(),
    );
    if (result.kind === "gone")
      return emailRefused(c, email, "El código venció. Pide otro.");
    if (result.kind === "wrong")
      return codeStep(
        c,
        {
          email,
          next: "/account",
          notice: "sent",
          error: wrongCode(result.left),
          forAccount: true,
        },
        422,
      );

    const change = await claimEmail(c.var.db, account, email, iso());
    if (change === "taken") return emailRefused(c, email, takenEmail);
    return c.redirect("/account?notice=email", 303);
  });

  routes.post("/account/profile", async (c) => {
    await openProfile(c.var.db, signedIn(c).id);
    return c.redirect("/account?notice=profile#profile", 303);
  });

  routes.post("/account/profile/hide", async (c) => {
    await closeProfile(c.var.db, signedIn(c).id);
    return c.redirect("/account?notice=profile#profile", 303);
  });

  routes.post("/account/passkeys/options", async (c) => {
    const account = signedIn(c);
    const existing = await listPasskeys(c.var.db, account.id);
    const options = await registrationOptions(
      rp(c),
      account,
      existing.map((p) => p.id),
    );
    const challengeId = await saveChallenge(c.var.db, options.challenge, iso());
    return c.json({ challengeId, options });
  });

  routes.post("/account/passkeys", async (c) => {
    const body = await json<{
      challengeId: string;
      response: RegistrationResponseJSON;
    }>(c);
    const failed = () =>
      c.json({ error: "No pudimos verificar la passkey." }, 400);
    if (!body.challengeId || !body.response) return failed();

    const challenge = await takeChallenge(c.var.db, body.challengeId, iso());
    const credential =
      challenge && (await verifyRegistration(rp(c), body.response, challenge));
    if (!credential) return failed();

    if (await findCredential(c.var.db, credential.id))
      return c.json({ error: "Esa passkey ya está registrada." }, 409);
    await addCredential(c.var.db, signedIn(c).id, credential, iso());
    return c.json({ redirect: "/account?notice=passkey#passkeys" });
  });

  routes.post("/account/passkeys/:id/remove", async (c) => {
    const account = signedIn(c);
    const passkeys = await listPasskeys(c.var.db, account.id);
    // Without an email, the last passkey is the only way back in.
    if (!account.email && passkeys.length <= 1)
      return c.redirect("/account#passkeys", 303);

    await removeCredential(c.var.db, account.id, c.req.param("id"));
    return c.redirect("/account?notice=passkey-removed#passkeys", 303);
  });

  return routes;
}
