import { Hono } from "hono";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { CodeGone, NewAccount, SignIn } from "../../pages/Account";
import { accountByEmail, createAccount } from "../accounts";
import {
  findCredential,
  saveChallenge,
  takeChallenge,
  touchCredential,
} from "../auth";
import { checkCode, issueVerified, requestCode, takeVerified } from "../codes";
import { emptyForm, type FormState } from "../form";
import {
  authenticationOptions,
  relyingParty,
  verifyAuthentication,
} from "../passkeys";
import { closeSession, returnPath, startSession } from "../session";
import { humanErrors } from "../signup";
import { TOKEN_FIELD, verifyHuman } from "../turnstile";
import { humanCheck, type AppEnv, type Ctx, type Deps } from "../web";
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

/** Sign-in at /entrar, by an emailed code or a passkey, and sign-out at /salir. */
export function signinRoutes({ now, fetch: fetcher }: Deps) {
  const routes = new Hono<AppEnv>();
  const iso = () => now().toISOString();
  const rp = (c: Ctx) => relyingParty(c.env.SITE_URL);

  for (const path of ["/entrar", "/entrar/*", "/salir"])
    routes.use(path, sameOrigin);

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

  return routes;
}
