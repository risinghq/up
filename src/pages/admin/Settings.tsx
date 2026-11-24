import type { Admin } from "../../worker/auth";

export type NewInvite = { name: string; url: string };

/** The Google Calendar connection. Absent when the site has no OAuth client. */
export type GooglePanel = {
  /** The connected account's email. */
  account?: string;
  notice?: "conectado" | "desconectado" | "error";
};

const googleNotice = {
  conectado: "Google Calendar quedó conectado.",
  desconectado: "Google Calendar quedó desconectado.",
  error: "Google no aceptó la conexión. Inténtalo otra vez.",
} as const;

function GoogleSection({ google }: { google: GooglePanel }) {
  return (
    <section class="settings-section" aria-labelledby="google-title">
      <div class="settings-label">
        <h2 id="google-title">Google Calendar y Meet</h2>
        <p class="hint">
          Cada evento se crea en este calendario con su llamada de Meet. Quien
          tenga cupo ve el enlace en su entrada.
        </p>
      </div>
      <div class="manage-card">
        {google.notice && (
          <p
            class={`notice${google.notice === "error" ? " notice-error" : ""}`}
            role={google.notice === "error" ? "alert" : "status"}
          >
            {googleNotice[google.notice]}
          </p>
        )}
        {google.account ? (
          <div class="google-account">
            <p>
              Conectado como <strong>{google.account}</strong>.
            </p>
            <form
              method="post"
              action="/admin/google/desconectar"
              data-confirm="¿Desconectar Google Calendar? Los eventos ya creados quedan en el calendario."
            >
              <button class="button button-small button-quiet" type="submit">
                Desconectar
              </button>
            </form>
          </div>
        ) : (
          <div class="google-account">
            <p>Ninguna cuenta conectada.</p>
            <a class="button button-small" href="/admin/google/conectar">
              Conectar Google
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

function AdminsSection(props: {
  admins: Admin[];
  invite?: NewInvite;
  inviteError?: string;
}) {
  return (
    <section class="settings-section" aria-labelledby="admins-title">
      <div class="settings-label">
        <h2 id="admins-title">Admins</h2>
        <p class="hint">
          Los admins crean y editan eventos y ven a los inscritos. Cada uno
          entra con su passkey.
        </p>
      </div>
      <div class="manage-card">
        <ul class="admin-people">
          {props.admins.map((a) => (
            <li key={a.id}>{a.name}</li>
          ))}
        </ul>
        {props.invite && (
          <div class="notice" role="status">
            <p>
              Envía este enlace a {props.invite.name}. Sirve una vez y vence en
              7 días:
            </p>
            <p class="invite-url">
              <code>{props.invite.url}</code>{" "}
              <button
                class="button button-small button-quiet"
                type="button"
                data-copy={props.invite.url}
                hidden
              >
                Copiar
              </button>
            </p>
          </div>
        )}
        <form method="post" action="/admin/invitaciones" class="inline-form">
          <div class="field">
            <label for="a-invite-name">Invitar a un admin</label>
            <input
              id="a-invite-name"
              name="name"
              placeholder="Nombre"
              aria-invalid={props.inviteError ? "true" : undefined}
              aria-describedby={
                props.inviteError ? "a-invite-name-error" : undefined
              }
            />
            {props.inviteError && (
              <p class="error" id="a-invite-name-error">
                {props.inviteError}
              </p>
            )}
          </div>
          <button class="button button-quiet" type="submit">
            Crear invitación
          </button>
        </form>
      </div>
    </section>
  );
}

export function Settings(props: {
  admins: Admin[];
  google?: GooglePanel;
  invite?: NewInvite;
  inviteError?: string;
}) {
  return (
    <div class="admin">
      <div class="admin-head">
        <h1>Ajustes</h1>
      </div>
      {props.google && <GoogleSection google={props.google} />}
      <AdminsSection
        admins={props.admins}
        invite={props.invite}
        inviteError={props.inviteError}
      />
    </div>
  );
}
