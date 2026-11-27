import type { Account } from "../../worker/accounts";
import type { WhatsAppMode } from "../../worker/whatsapp";
import { AccountName } from "./AccountName";

/** The Google Calendar connection. Absent when the site has no OAuth client. */
export type GooglePanel = {
  /** The connected account's email. */
  account?: string;
  notice?: "connected" | "disconnected" | "error";
};

const googleNotice = {
  connected: "Google Calendar quedó conectado.",
  disconnected: "Google Calendar quedó desconectado.",
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
              action="/admin/google/disconnect"
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
            <a class="button button-small" href="/admin/google/connect">
              Conectar Google
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

const whatsappStatus = {
  live: "Conectado. Cada inscrito recibe su entrada y el recordatorio por WhatsApp.",
  mock: "Simulado. Los mensajes quedan en el registro del sitio y no llegan a nadie.",
  off: "Desactivado. Los avisos salen solo por correo.",
} as const;

function WhatsAppSection({ mode }: { mode: WhatsAppMode }) {
  return (
    <section class="settings-section" aria-labelledby="whatsapp-title">
      <div class="settings-label">
        <h2 id="whatsapp-title">Avisos por WhatsApp</h2>
        <p class="hint">
          La confirmación, el cupo liberado y el recordatorio salen también al
          número que dejó cada inscrito.
        </p>
      </div>
      <div class="manage-card">
        <p>{whatsappStatus[mode]}</p>
      </div>
    </section>
  );
}

export type AdminsNotice = "added" | "removed";

const adminsNotice: Record<AdminsNotice, string> = {
  added: "Listo: ya es admin.",
  removed: "Ya no es admin.",
};

export type AdminsPanel = {
  admins: Account[];
  /** The signed-in admin, who cannot remove themself. */
  selfId: string;
  email: string;
  error?: string;
  notice?: AdminsNotice;
};

function AdminsSection(props: AdminsPanel) {
  return (
    <section class="settings-section" aria-labelledby="admins-title">
      <div class="settings-label">
        <h2 id="admins-title">Admins</h2>
        <p class="hint">
          Los admins crean y editan eventos y ven a los inscritos. Para sumar a
          alguien, primero debe crear su cuenta en /sign-in.
        </p>
      </div>
      <div class="manage-card">
        {props.notice && (
          <p class="notice" role="status">
            {adminsNotice[props.notice]}
          </p>
        )}
        <ul class="team-list">
          {props.admins.map((a) => (
            <li key={a.id} class="team-member">
              <AccountName name={a.name} email={a.email} />
              {a.id === props.selfId ? (
                <span class="team-email">Tú</span>
              ) : (
                <form
                  method="post"
                  action={`/admin/admins/${a.id}/remove`}
                  data-confirm={`¿Quitarle el acceso de admin a ${a.name}?`}
                >
                  <button
                    class="button button-small button-quiet"
                    type="submit"
                  >
                    Quitar
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <form method="post" action="/admin/admins" class="inline-form">
          <div class="field">
            <label for="a-admin-email">Hacer admin</label>
            <input
              id="a-admin-email"
              name="email"
              type="email"
              inputMode="email"
              placeholder="correo@ejemplo.com"
              value={props.email}
              required
              autoFocus={Boolean(props.error)}
              aria-invalid={props.error ? "true" : undefined}
              aria-describedby={props.error ? "a-admin-email-error" : undefined}
            />
            {props.error && (
              <p class="error" id="a-admin-email-error">
                {props.error}
              </p>
            )}
          </div>
          <button class="button button-quiet" type="submit">
            Hacer admin
          </button>
        </form>
      </div>
    </section>
  );
}

export function Settings(props: {
  admins: AdminsPanel;
  google?: GooglePanel;
  whatsapp: WhatsAppMode;
}) {
  return (
    <div class="admin">
      <div class="admin-head">
        <h1>Ajustes</h1>
      </div>
      {props.google && <GoogleSection google={props.google} />}
      <WhatsAppSection mode={props.whatsapp} />
      <AdminsSection {...props.admins} />
    </div>
  );
}
