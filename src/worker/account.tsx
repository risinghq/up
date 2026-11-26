import { Hono } from "hono";
import { csrf } from "hono/csrf";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { ComponentChildren } from "preact";
import {
  AccountPage,
  CodeGone,
  CodeStep,
  NewAccount,
  SignIn,
  type AccountNotice,
  type CodeNotice,
} from "../pages/Account";
import {
  accountByEmail,
  claimEmail,
  createAccount,
  type Account,
} from "./accounts";
import {
  addCredential,
  findCredential,
  listPasskeys,
  removeCredential,
  saveChallenge,
  takeChallenge,
  touchCredential,
} from "./auth";
import {
  checkCode,
  CODE_MINUTES,
  issueVerified,
  requestCode,
  takeVerified,
} from "./codes";
import {
  emailPattern,
  emptyForm,
  normalizePhone,
  type FormState,
} from "./form";
import type { Fetch } from "./google";
import { codeMail, sendMail, type CodePurpose } from "./mail";
import {
  authenticationOptions,
  registrationOptions,
  relyingParty,
  verifyAuthentication,
  verifyRegistration,
} from "./passkeys";
import { phoneOf, updateContact } from "./people";
import { closeProfile, openProfile, profileIdOf } from "./profiles";
import { ticketsOf } from "./registrations";
import { closeSession, returnPath, startSession } from "./session";
import { humanErrors } from "./signup";
import { TOKEN_FIELD, verifyHuman } from "./turnstile";
import { after, humanCheck, page, site, type AppEnv, type Ctx } from "./web";

const accountNotices: AccountNotice[] = [
  "datos",
  "correo",
  "passkey",
  "passkey-quitada",
  "perfil",
];

const text = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();

const emailError = (email: string) =>
  emailPattern.test(email) && email.length <= 254
    ? null
    : "Escribe un correo válido.";

const nameError = (name: string) =>
  name.length < 2
    ? "Escribe tu nombre."
    : name.length > 120
      ? "El nombre es demasiado largo."
      : null;

/** The sign-in pages at /entrar and the signed-in person's page at /cuenta. */
export function accountRoutes(now: () => Date, fetcher: Fetch) {
  const routes = new Hono<AppEnv>();
  const iso = () => now().toISOString();
  const rp = (c: Ctx) => relyingParty(c.env.SITE_URL);

  const json = async <T,>(c: Ctx): Promise<Partial<T>> =>
    c.req.json<Partial<T>>().catch(() => ({}));

  const view = (
    c: Ctx,
    title: string,
    body: ComponentChildren,
    status = 200,
  ) => {
    c.header("Cache-Control", "no-store");
    return page(
      c,
      {
        title,
        description: "Tu cuenta de up.rising.sh.",
        url: `${site(c)}${c.req.path}`,
        noindex: true,
      },
      body,
      status,
      { passkeys: true },
    );
  };

  const retry = (volver: string, email = "") =>
    `/entrar?${new URLSearchParams({ volver, ...(email && { correo: email }) })}`;

  /** Mails a code once the response is out; the page never waits for it. */
  const mailCode = (
    c: Ctx,
    email: string,
    code: string,
    purpose: CodePurpose,
  ) =>
    after(
      c,
      sendMail(c.env.EMAIL, codeMail(email, code, purpose, CODE_MINUTES)),
    );

  const signInPage = (c: Ctx, form: FormState, volver: string, status = 200) =>
    view(
      c,
      "Entrar",
      <SignIn
        form={form}
        volver={volver}
        siteKey={humanCheck(c)?.siteKey ?? null}
      />,
      status,
    );

  const codeStep = (
    c: Ctx,
    props: {
      email: string;
      volver: string;
      notice: CodeNotice;
      error?: string;
      forAccount?: boolean;
    },
    status = 200,
  ) =>
    view(
      c,
      "Revisa tu correo",
      <CodeStep
        email={props.email}
        volver={props.volver}
        notice={props.notice}
        error={props.error ?? null}
        action={props.forAccount ? "/cuenta/correo/codigo" : "/entrar/codigo"}
        retry={
          props.forAccount ? "/cuenta#correo" : retry(props.volver, props.email)
        }
      />,
      status,
    );

  const wrongCode = (left: number) =>
    left === 1
      ? "El código no coincide. Te queda 1 intento."
      : `El código no coincide. Te quedan ${left} intentos.`;

  // Form posts must come from this origin. The passkey endpoints take JSON,
  // which a cross-site form cannot send. Mounted at the root, the check is
  // scoped to these paths so the register form and webhooks keep their own.
  const sameOrigin = csrf({
    origin: (origin, c) => origin === new URL(c.env.SITE_URL).origin,
  });
  for (const path of ["/entrar", "/entrar/*", "/salir", "/cuenta", "/cuenta/*"])
    routes.use(path, sameOrigin);

  routes.get("/entrar", (c) => {
    const volver = returnPath(c.req.query("volver"));
    if (c.get("account")) return c.redirect(volver, 303);
    const email = c.req.query("correo") ?? "";
    return signInPage(c, { values: { email }, errors: {} }, volver);
  });

  routes.post("/entrar", async (c) => {
    const form = await c.req.formData();
    const volver = returnPath(text(form, "volver"));
    const email = text(form, "email").toLowerCase();

    const invalid = emailError(email);
    if (invalid)
      return signInPage(
        c,
        { values: { email }, errors: { email: invalid } },
        volver,
        422,
      );

    const keys = humanCheck(c);
    if (keys) {
      const verdict = await verifyHuman(
        fetcher,
        keys.secret,
        text(form, TOKEN_FIELD),
        c.req.header("CF-Connecting-IP") ?? null,
      );
      if (verdict !== "human")
        return signInPage(
          c,
          { values: { email }, errors: { human: humanErrors[verdict] } },
          volver,
          422,
        );
    }

    // The answer is the same whether or not the email has an account.
    const code = await requestCode(c.env.DB, email, null, iso());
    if (code) await mailCode(c, email, code, "sign-in");
    return codeStep(c, { email, volver, notice: code ? "sent" : "cooldown" });
  });

  routes.post("/entrar/codigo", async (c) => {
    const form = await c.req.formData();
    const volver = returnPath(text(form, "volver"));
    const email = text(form, "email").toLowerCase();

    const result = await checkCode(
      c.env.DB,
      email,
      text(form, "code"),
      null,
      iso(),
    );
    if (result.kind === "gone")
      return view(
        c,
        "Código vencido",
        <CodeGone retry={retry(volver, email)} />,
        410,
      );
    if (result.kind === "wrong")
      return codeStep(
        c,
        { email, volver, notice: "sent", error: wrongCode(result.left) },
        422,
      );

    const account = await accountByEmail(c.env.DB, email);
    if (account) {
      await startSession(c, account.id, iso());
      return c.redirect(volver, 303);
    }

    const token = await issueVerified(c.env.DB, email, iso());
    return view(
      c,
      "Crea tu cuenta",
      <NewAccount
        email={email}
        token={token}
        volver={volver}
        form={emptyForm}
      />,
    );
  });

  routes.post("/entrar/cuenta", async (c) => {
    const form = await c.req.formData();
    const volver = returnPath(text(form, "volver"));
    const email = text(form, "email").toLowerCase();
    const token = text(form, "token");
    const name = text(form, "name");
    const privacy = form.get("privacy") ? "on" : "";

    const errors: Record<string, string> = {};
    const badName = nameError(name);
    if (badName) errors.name = badName;
    if (!privacy)
      errors.privacy = "Necesitamos tu aceptación para crear tu cuenta.";
    if (Object.keys(errors).length)
      return view(
        c,
        "Crea tu cuenta",
        <NewAccount
          email={email}
          token={token}
          volver={volver}
          form={{ values: { name, privacy }, errors }}
        />,
        422,
      );

    if (!(await takeVerified(c.env.DB, email, token, iso())))
      return view(
        c,
        "Código vencido",
        <CodeGone retry={retry(volver, email)} />,
        410,
      );

    // A registration may have made the person since the code was checked.
    const account =
      (await accountByEmail(c.env.DB, email)) ??
      (await createAccount(c.env.DB, { email, name }, iso()));
    await startSession(c, account.id, iso());
    return c.redirect(volver, 303);
  });

  routes.post("/entrar/passkey/opciones", async (c) => {
    const options = await authenticationOptions(rp(c));
    const challengeId = await saveChallenge(c.env.DB, options.challenge, iso());
    return c.json({ challengeId, options });
  });

  routes.post("/entrar/passkey", async (c) => {
    const body = await json<{
      challengeId: string;
      response: AuthenticationResponseJSON;
      volver: string;
    }>(c);
    const refused = () =>
      c.json(
        {
          error:
            "No reconocemos esa passkey. Entra con un código de tu correo.",
        },
        401,
      );
    if (!body.challengeId || typeof body.response?.id !== "string")
      return refused();

    const challenge = await takeChallenge(c.env.DB, body.challengeId, iso());
    const stored =
      challenge && (await findCredential(c.env.DB, body.response.id));
    if (!challenge || !stored) return refused();

    const counter = await verifyAuthentication(
      rp(c),
      body.response,
      challenge,
      stored,
    );
    if (counter === null) return refused();

    await touchCredential(c.env.DB, stored.id, counter, iso());
    await startSession(c, stored.personId, iso());
    return c.json({ redirect: returnPath(body.volver) });
  });

  routes.post("/salir", async (c) => {
    await closeSession(c);
    return c.redirect("/", 303);
  });

  // Every /cuenta route needs a signed-in person.
  const guard = async (c: Ctx, next: () => Promise<void>) => {
    if (c.get("account")) return next();
    return c.redirect(
      retry(c.req.method === "GET" ? c.req.path : "/cuenta"),
      303,
    );
  };
  routes.use("/cuenta", guard);
  routes.use("/cuenta/*", guard);

  const signedIn = (c: Ctx) => c.get("account") as Account;

  const accountPage = async (
    c: Ctx,
    forms: { contact?: FormState; emailForm?: FormState } = {},
    status = 200,
  ) => {
    const account = signedIn(c);
    const notice =
      accountNotices.find((n) => n === c.req.query("aviso")) ?? null;
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
              phone: (await phoneOf(c.env.DB, account.id)) ?? "",
            },
            errors: {},
          }
        }
        emailForm={forms.emailForm ?? emptyForm}
        tickets={await ticketsOf(c.env.DB, account.id)}
        profileId={await profileIdOf(c.env.DB, account.id)}
        passkeys={await listPasskeys(c.env.DB, account.id)}
        notice={notice}
      />,
      status,
    );
  };

  routes.get("/cuenta", (c) => accountPage(c));

  routes.post("/cuenta", async (c) => {
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

    await updateContact(c.env.DB, signedIn(c).id, { name, phone }, iso());
    return c.redirect("/cuenta?aviso=datos", 303);
  });

  const emailRefused = (c: Ctx, email: string, error: string) =>
    accountPage(
      c,
      { emailForm: { values: { email }, errors: { email: error } } },
      422,
    );

  const takenEmail =
    "Ese correo ya es de otra cuenta. Entra con él y agrega desde ahí lo que necesites.";

  routes.post("/cuenta/correo", async (c) => {
    const account = signedIn(c);
    const email = text(await c.req.formData(), "email").toLowerCase();

    const invalid = emailError(email);
    if (invalid) return emailRefused(c, email, invalid);
    if (email === account.email)
      return emailRefused(c, email, "Ya entras con ese correo.");

    const holder = await accountByEmail(c.env.DB, email);
    if (holder && account.email) return emailRefused(c, email, takenEmail);

    const code = await requestCode(c.env.DB, email, account.id, iso());
    if (code) await mailCode(c, email, code, "add-email");
    return codeStep(c, {
      email,
      volver: "/cuenta",
      notice: code ? "sent" : "cooldown",
      forAccount: true,
    });
  });

  routes.post("/cuenta/correo/codigo", async (c) => {
    const account = signedIn(c);
    const form = await c.req.formData();
    const email = text(form, "email").toLowerCase();

    const result = await checkCode(
      c.env.DB,
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
          volver: "/cuenta",
          notice: "sent",
          error: wrongCode(result.left),
          forAccount: true,
        },
        422,
      );

    const change = await claimEmail(c.env.DB, account, email, iso());
    if (change === "taken") return emailRefused(c, email, takenEmail);
    return c.redirect("/cuenta?aviso=correo", 303);
  });

  routes.post("/cuenta/perfil", async (c) => {
    await openProfile(c.env.DB, signedIn(c).id);
    return c.redirect("/cuenta?aviso=perfil#perfil", 303);
  });

  routes.post("/cuenta/perfil/ocultar", async (c) => {
    await closeProfile(c.env.DB, signedIn(c).id);
    return c.redirect("/cuenta?aviso=perfil#perfil", 303);
  });

  routes.post("/cuenta/passkeys/opciones", async (c) => {
    const account = signedIn(c);
    const existing = await listPasskeys(c.env.DB, account.id);
    const options = await registrationOptions(
      rp(c),
      account,
      existing.map((p) => p.id),
    );
    const challengeId = await saveChallenge(c.env.DB, options.challenge, iso());
    return c.json({ challengeId, options });
  });

  routes.post("/cuenta/passkeys", async (c) => {
    const body = await json<{
      challengeId: string;
      response: RegistrationResponseJSON;
    }>(c);
    const failed = () =>
      c.json({ error: "No pudimos verificar la passkey." }, 400);
    if (!body.challengeId || !body.response) return failed();

    const challenge = await takeChallenge(c.env.DB, body.challengeId, iso());
    const credential =
      challenge && (await verifyRegistration(rp(c), body.response, challenge));
    if (!credential) return failed();

    if (await findCredential(c.env.DB, credential.id))
      return c.json({ error: "Esa passkey ya está registrada." }, 409);
    await addCredential(c.env.DB, signedIn(c).id, credential, iso());
    return c.json({ redirect: "/cuenta?aviso=passkey#passkeys" });
  });

  routes.post("/cuenta/passkeys/:id/quitar", async (c) => {
    const account = signedIn(c);
    const passkeys = await listPasskeys(c.env.DB, account.id);
    // Without an email, the last passkey is the only way back in.
    if (!account.email && passkeys.length <= 1)
      return c.redirect("/cuenta#passkeys", 303);

    await removeCredential(c.env.DB, account.id, c.req.param("id"));
    return c.redirect("/cuenta?aviso=passkey-quitada#passkeys", 303);
  });

  return routes;
}
