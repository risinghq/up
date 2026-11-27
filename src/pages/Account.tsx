import type { ComponentChildren } from "preact";
import type { Passkey } from "../worker/auth";
import { CODE_MINUTES } from "../worker/codes";
import type { FormState } from "../worker/form";
import type { AccountTicket } from "../worker/registrations";
import { doorRoles, roleLabel, type AccountRole } from "../worker/roles";
import { fullDate, shortDate } from "../worker/time";
import { Check, Field, HumanCheck } from "./FormFields";

/**
 * Runs the WebAuthn ceremony in src/client/passkey.ts, which writes progress
 * and errors into the status line under the button.
 */
function PasskeyButton(props: {
  action: "sign-in" | "add";
  next?: string;
  label: string;
  light?: boolean;
}) {
  return (
    <div class="passkey">
      <button
        class={
          props.light
            ? "button button-light button-block"
            : "button button-block"
        }
        type="button"
        data-passkey={props.action}
        data-next={props.next}
        disabled
      >
        {props.label}
      </button>
      <p class="hint" role="status" data-passkey-status>
        <noscript>Necesitas JavaScript para usar una passkey.</noscript>
      </p>
    </div>
  );
}

const NextField = ({ value }: { value: string }) => (
  <input type="hidden" name="next" value={value} />
);

function Narrow(props: { title: string; children: ComponentChildren }) {
  return (
    <div class="page account-narrow">
      <h1>{props.title}</h1>
      {props.children}
    </div>
  );
}

export function SignIn(props: {
  form: FormState;
  next: string;
  siteKey: string | null;
}) {
  const errors = props.form.errors;
  return (
    <Narrow title="Entrar">
      <p class="account-lead">
        Te enviamos un código a tu correo. No necesitas contraseña.
      </p>
      <form class="card account-form" method="post" action="/sign-in">
        <NextField value={props.next} />
        <Field
          name="email"
          label="Correo"
          type="email"
          autocomplete="email"
          inputMode="email"
          form={props.form}
          focus={Boolean(errors.email)}
        />
        {props.siteKey && (
          <HumanCheck
            siteKey={props.siteKey}
            error={errors.human}
            focus={Boolean(errors.human)}
            action="entrar"
          />
        )}
        <button class="button button-block" type="submit">
          Enviarme un código
        </button>
      </form>
      <p class="account-or">o</p>
      <PasskeyButton
        action="sign-in"
        next={props.next}
        label="Entrar con passkey"
        light
      />
    </Narrow>
  );
}

/** The six-digit field; a phone offers the mailed code above its keyboard. */
function CodeField(props: { error: string | null }) {
  return (
    <div class="field">
      <label for="f-code">Código</label>
      <input
        id="f-code"
        name="code"
        class="code-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        required
        autoFocus
        aria-invalid={props.error ? "true" : undefined}
        aria-describedby={props.error ? "f-code-error" : undefined}
      />
      {props.error && (
        <p class="error" id="f-code-error">
          {props.error}
        </p>
      )}
    </div>
  );
}

export type CodeNotice = "sent" | "cooldown";

const codeNotice: Record<CodeNotice, string> = {
  sent: "Te enviamos un código de 6 dígitos a",
  cooldown: "Ya te enviamos un código hace menos de un minuto a",
};

/** The step after the email: type the mailed code. */
export function CodeStep(props: {
  email: string;
  next: string;
  notice: CodeNotice;
  error: string | null;
  action: string;
  retry: string;
}) {
  return (
    <Narrow title="Revisa tu correo">
      <p class="account-lead">
        {codeNotice[props.notice]} <strong>{props.email}</strong>. Vence en{" "}
        {CODE_MINUTES} minutos.
      </p>
      <form class="card account-form" method="post" action={props.action}>
        <NextField value={props.next} />
        <input type="hidden" name="email" value={props.email} />
        <CodeField error={props.error} />
        <button class="button button-block" type="submit">
          Continuar
        </button>
      </form>
      <p class="account-foot links">
        ¿No llegó? Revisa el spam o <a href={props.retry}>usa otro correo</a>.
      </p>
    </Narrow>
  );
}

/** The first sign-in with an email nobody holds: name the new account. */
export function NewAccount(props: {
  email: string;
  token: string;
  next: string;
  form: FormState;
}) {
  const errors = props.form.errors;
  return (
    <Narrow title="Crea tu cuenta">
      <p class="account-lead">
        Es la primera vez que entras con <strong>{props.email}</strong>.
      </p>
      <form class="card account-form" method="post" action="/sign-in/account">
        <NextField value={props.next} />
        <input type="hidden" name="email" value={props.email} />
        <input type="hidden" name="token" value={props.token} />
        <Field
          name="name"
          label="Nombre y apellido"
          autocomplete="name"
          form={props.form}
          focus={!errors.privacy}
        />
        <Check name="privacy" form={props.form} focus={Boolean(errors.privacy)}>
          Acepto la <a href="/privacy">política de privacidad</a>.
        </Check>
        <button class="button button-block" type="submit">
          Crear mi cuenta
        </button>
      </form>
    </Narrow>
  );
}

export function CodeGone(props: { retry: string }) {
  return (
    <Narrow title="El código ya no sirve">
      <p class="account-lead links">
        Venció o se usaron todos sus intentos.{" "}
        <a href={props.retry}>Pide otro</a>.
      </p>
    </Narrow>
  );
}

export type AccountNotice =
  | "details"
  | "email"
  | "passkey"
  | "passkey-removed"
  | "profile";

const notices: Record<AccountNotice, string> = {
  details: "Guardamos tus datos.",
  email: "Tu correo quedó confirmado.",
  passkey: "Agregamos la passkey. Ya puedes entrar con ella.",
  "passkey-removed": "Quitamos la passkey.",
  profile: "Actualizamos tu perfil.",
};

export type AccountView = {
  name: string;
  email: string | null;
  admin: boolean;
  contact: FormState;
  emailForm: FormState;
  tickets: AccountTicket[];
  roles: AccountRole[];
  profileId: string | null;
  passkeys: Passkey[];
  notice: AccountNotice | null;
};

function Section(props: {
  id: string;
  title: string;
  hint?: string;
  children: ComponentChildren;
}) {
  return (
    <section
      class="card account-section"
      id={props.id}
      aria-labelledby={`${props.id}-title`}
    >
      <h2 id={`${props.id}-title`}>{props.title}</h2>
      {props.hint && <p class="hint">{props.hint}</p>}
      {props.children}
    </section>
  );
}

function Tickets({ tickets }: { tickets: AccountTicket[] }) {
  if (!tickets.length)
    return (
      <p class="account-empty links">
        Aún no tienes entradas. <a href="/">Mira los próximos eventos</a>.
      </p>
    );
  return (
    <ul class="account-list">
      {tickets.map((t) => (
        <li key={t.token}>
          <a href={`/ticket/${t.token}`}>
            <span class="account-item-title">{t.title}</span>
            <span class="account-item-meta">
              <time dateTime={t.start}>{shortDate(t.start)}</time>
              {t.past
                ? " · Terminó"
                : t.status === "waitlist" && " · En lista de espera"}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Where a role leads: the door while the event is ahead, the certificate once it ended. */
function roleLink(r: AccountRole) {
  if (r.past) return { href: `/c/${r.certificateId}`, label: " · Certificado" };
  if (doorRoles.includes(r.role))
    return { href: `/door/${r.slug}`, label: " · Abrir la puerta" };
  return { href: `/${r.slug}`, label: "" };
}

function Roles({ roles }: { roles: AccountRole[] }) {
  return (
    <ul class="account-list">
      {roles.map((r) => {
        const link = roleLink(r);
        return (
          <li key={`${r.slug}-${r.role}`}>
            <a href={link.href}>
              <span class="account-item-title">{r.title}</span>
              <span class="account-item-meta">
                {roleLabel[r.role].one} ·{" "}
                <time dateTime={r.start}>{shortDate(r.start)}</time>
                {link.label}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Without an email, the last passkey is the only way back in, so it stays. */
function Passkeys(props: { passkeys: Passkey[]; hasEmail: boolean }) {
  const { passkeys } = props;
  const removable = props.hasEmail || passkeys.length > 1;
  return (
    <>
      {passkeys.length > 0 && (
        <ul class="account-list">
          {passkeys.map((p, i) => (
            <li key={p.id} class="account-row">
              <span>
                <span class="account-item-title">Passkey {i + 1}</span>
                <span class="account-item-meta">
                  Creada el {fullDate(p.createdAt)}
                  {p.lastUsedAt && `, usada el ${fullDate(p.lastUsedAt)}`}
                </span>
              </span>
              {removable && (
                <form
                  method="post"
                  action={`/account/passkeys/${encodeURIComponent(p.id)}/remove`}
                  data-confirm="¿Quitar esta passkey? Ese dispositivo ya no podrá entrar con ella."
                >
                  <button
                    class="button button-light button-small"
                    type="submit"
                  >
                    Quitar
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <PasskeyButton action="add" label="Agregar una passkey" light />
    </>
  );
}

export function AccountPage(view: AccountView) {
  return (
    <div class="page account">
      <h1>Tu cuenta</h1>
      {view.admin && (
        <p class="account-lead links">
          Eres admin. <a href="/admin">Ir al panel</a>.
        </p>
      )}
      {view.notice && (
        <p class="notice" role="status">
          {notices[view.notice]}
        </p>
      )}

      <Section id="tickets" title="Tus entradas">
        <Tickets tickets={view.tickets} />
      </Section>

      {view.roles.length > 0 && (
        <Section id="roles" title="Tus roles">
          <Roles roles={view.roles} />
        </Section>
      )}

      <Section id="details" title="Tus datos">
        <form class="account-form" method="post" action="/account">
          <Field
            name="name"
            label="Nombre y apellido"
            autocomplete="name"
            form={view.contact}
          />
          <Field
            name="phone"
            label="WhatsApp"
            type="tel"
            autocomplete="tel"
            inputMode="tel"
            required={false}
            hint="Ahí te llegan tus entradas y avisos."
            form={view.contact}
          />
          <button class="button button-light" type="submit">
            Guardar
          </button>
        </form>
      </Section>

      <Section
        id="email"
        title="Correo"
        hint={
          view.email
            ? `Entras con ${view.email}. Para cambiarlo, confirma el nuevo con un código.`
            : "Tu cuenta aún no tiene correo. Agrégalo para entrar con un código y recibir tus entradas."
        }
      >
        <form class="account-inline" method="post" action="/account/email">
          <Field
            name="email"
            label={view.email ? "Correo nuevo" : "Correo"}
            type="email"
            autocomplete="email"
            inputMode="email"
            form={view.emailForm}
            focus={Boolean(view.emailForm.errors.email)}
          />
          <button class="button button-light" type="submit">
            Enviar código
          </button>
        </form>
      </Section>

      <Section
        id="profile"
        title="Perfil público"
        hint="Muestra tu nombre, los eventos a los que fuiste y tus roles. Solo lo ve quien tenga el enlace."
      >
        {view.profileId ? (
          <div class="account-row">
            <a
              class="button button-light button-small"
              href={`/p/${view.profileId}`}
            >
              Ver mi perfil
            </a>
            <form method="post" action="/account/profile/hide">
              <button class="button button-light button-small" type="submit">
                Ocultar
              </button>
            </form>
          </div>
        ) : (
          <form method="post" action="/account/profile">
            <button class="button button-light" type="submit">
              Abrir mi perfil
            </button>
          </form>
        )}
      </Section>

      <Section
        id="passkeys"
        title="Passkeys"
        hint="Entra con tu huella, tu rostro o el PIN del dispositivo, sin esperar un código."
      >
        <Passkeys passkeys={view.passkeys} hasEmail={Boolean(view.email)} />
      </Section>

      <form class="account-signout" method="post" action="/sign-out">
        <button class="button button-quiet" type="submit">
          Salir
        </button>
      </form>
    </div>
  );
}
