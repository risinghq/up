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

/** Sign-in at /sign-in, by an emailed code or a passkey, and sign-out at /sign-out. */
export function signinRoutes({ now, fetch: fetcher }: Deps) {
  const routes = new Hono<AppEnv>();
  const iso = () => now().toISOString();
  const rp = (c: Ctx) => relyingParty(c.env.SITE_URL);

  for (const path of ["/sign-in", "/sign-in/*", "/sign-out"])
    routes.use(path, sameOrigin);

  const signInPage = (c: Ctx, form: FormState, next: string, status = 200) =>
    view(
      c,
      "Entrar",
      <SignIn
        form={form}
        next={next}
        siteKey={humanCheck(c)?.siteKey ?? null}
      />,
      status,
    );

  routes.get("/sign-in", (c) => {
    const next = returnPath(c.req.query("next"));
    if (c.get("account")) return c.redirect(next, 303);

    const email = c.req.query("email") ?? "";
    return signInPage(c, { values: { email }, errors: {} }, next);
  });

  routes.post("/sign-in", async (c) => {
    const form = await c.req.formData();
    const next = returnPath(text(form, "next"));
    const email = text(form, "email").toLowerCase();

    const invalid = emailError(email);
    if (invalid)
      return signInPage(
        c,
        { values: { email }, errors: { email: invalid } },
        next,
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
          next,
          422,
        );
    }

    // The answer is the same whether or not the email has an account.
    const code = await requestCode(c.var.db, email, null, iso());
    if (code) await mailCode(c, email, code, "sign-in");
    return codeStep(c, { email, next, notice: code ? "sent" : "cooldown" });
  });

  routes.post("/sign-in/code", async (c) => {
    const form = await c.req.formData();
    const next = returnPath(text(form, "next"));
    const email = text(form, "email").toLowerCase();

    const result = await checkCode(
      c.var.db,
      email,
      text(form, "code"),
      null,
      iso(),
    );
    if (result.kind === "gone")
      return view(
        c,
        "Código vencido",
        <CodeGone retry={retry(next, email)} />,
        410,
      );
    if (result.kind === "wrong")
      return codeStep(
        c,
        { email, next, notice: "sent", error: wrongCode(result.left) },
        422,
      );

    const account = await accountByEmail(c.var.db, email);
    if (account) {
      await startSession(c, account.id, iso());
      return c.redirect(next, 303);
    }

    const token = await issueVerified(c.var.db, email, iso());
    return view(
      c,
      "Crea tu cuenta",
      <NewAccount email={email} token={token} next={next} form={emptyForm} />,
    );
  });

  routes.post("/sign-in/account", async (c) => {
    const form = await c.req.formData();
    const next = returnPath(text(form, "next"));
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
          next={next}
          form={{ values: { name, privacy }, errors }}
        />,
        422,
      );

    if (!(await takeVerified(c.var.db, email, token, iso())))
      return view(
        c,
        "Código vencido",
        <CodeGone retry={retry(next, email)} />,
        410,
      );

    // A registration may have made the person since the code was checked.
    const account =
      (await accountByEmail(c.var.db, email)) ??
      (await createAccount(c.var.db, { email, name }, iso()));
    await startSession(c, account.id, iso());
    return c.redirect(next, 303);
  });

  routes.post("/sign-in/passkey/options", async (c) => {
    const options = await authenticationOptions(rp(c));
    const challengeId = await saveChallenge(c.var.db, options.challenge, iso());
    return c.json({ challengeId, options });
  });

  routes.post("/sign-in/passkey", async (c) => {
    const body = await json<{
      challengeId: string;
      response: AuthenticationResponseJSON;
      next: string;
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

    const challenge = await takeChallenge(c.var.db, body.challengeId, iso());
    const stored =
      challenge && (await findCredential(c.var.db, body.response.id));
    if (!challenge || !stored) return refused();

    const counter = await verifyAuthentication(
      rp(c),
      body.response,
      challenge,
      stored,
    );
    if (counter === null) return refused();

    await touchCredential(c.var.db, stored.id, counter, iso());
    await startSession(c, stored.personId, iso());
    return c.json({ redirect: returnPath(body.next) });
  });

  routes.post("/sign-out", async (c) => {
    await closeSession(c);
    return c.redirect("/", 303);
  });

  return routes;
}
