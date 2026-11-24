/**
 * The sign-in and invite pages. Their button runs the WebAuthn ceremony in
 * src/client/admin.ts, which writes progress and errors into the status line.
 */
function PasskeyButton(props: {
  action: string;
  invite?: string;
  label: string;
}) {
  return (
    <>
      <button
        class="button button-block"
        type="button"
        data-passkey={props.action}
        data-invite={props.invite}
        disabled
      >
        {props.label}
      </button>
      <p class="hint" role="status" data-passkey-status>
        <noscript>Necesitas JavaScript para usar una passkey.</noscript>
      </p>
    </>
  );
}

export function SignIn() {
  return (
    <section class="card admin-narrow">
      <h1>Entrar como admin</h1>
      <p>
        Usa la passkey que creaste con tu invitación. Tu teléfono o tu
        computadora la guardan; no hay contraseña.
      </p>
      <PasskeyButton action="entrar" label="Entrar con passkey" />
    </section>
  );
}

export function Invite(props: { name: string; token: string }) {
  return (
    <section class="card admin-narrow">
      <h1>Hola, {props.name}</h1>
      <p>
        Te invitaron a administrar up. Crea una passkey en este dispositivo: con
        ella entrarás desde ahora. El enlace sirve una sola vez.
      </p>
      <PasskeyButton
        action="registro"
        invite={props.token}
        label="Crear mi passkey"
      />
    </section>
  );
}

export function InviteGone() {
  return (
    <section class="card admin-narrow">
      <h1>Esta invitación ya no sirve</h1>
      <p>
        Se usó o venció. Pide un enlace nuevo a otro admin. Si ya creaste tu
        passkey, <a href="/admin/entrar">entra aquí</a>.
      </p>
    </section>
  );
}
