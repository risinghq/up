import { csrf } from "hono/csrf";
import type { ComponentChildren } from "preact";
import { CodeStep, type CodeNotice } from "../../pages/Account";
import { CODE_MINUTES } from "../codes";
import { emailPattern } from "../form";
import { codeMail, sendMail, type CodePurpose } from "../mail";
import { after, page, site, type Ctx } from "../web";

export const text = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();

export const json = async <T,>(c: Ctx): Promise<Partial<T>> =>
  c.req.json<Partial<T>>().catch(() => ({}));

export const emailError = (email: string) =>
  emailPattern.test(email) && email.length <= 254
    ? null
    : "Escribe un correo válido.";

export const nameError = (name: string) =>
  name.length < 2
    ? "Escribe tu nombre."
    : name.length > 120
      ? "El nombre es demasiado largo."
      : null;

export const wrongCode = (left: number) =>
  left === 1
    ? "El código no coincide. Te queda 1 intento."
    : `El código no coincide. Te quedan ${left} intentos.`;

export const retry = (next: string, email = "") =>
  `/sign-in?${new URLSearchParams({ next, ...(email && { email }) })}`;

/**
 * Form posts must come from this origin. The passkey endpoints take JSON,
 * which a cross-site form cannot send. The sign-in and account routes mount at
 * the root, so each scopes this check to its own paths.
 */
export const sameOrigin = csrf({
  origin: (origin, c) => origin === new URL(c.env.SITE_URL).origin,
});

export const view = (
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

/** Mails a code once the response is out; the page never waits for it. */
export const mailCode = (
  c: Ctx,
  email: string,
  code: string,
  purpose: CodePurpose,
) =>
  after(c, sendMail(c.env.EMAIL, codeMail(email, code, purpose, CODE_MINUTES)));

export const codeStep = (
  c: Ctx,
  props: {
    email: string;
    next: string;
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
      next={props.next}
      notice={props.notice}
      error={props.error ?? null}
      action={props.forAccount ? "/account/email/code" : "/sign-in/code"}
      retry={
        props.forAccount ? "/account#email" : retry(props.next, props.email)
      }
    />,
    status,
  );
