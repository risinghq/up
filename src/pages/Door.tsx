import type { EventMeta } from "../worker/events";
import type { FormState } from "../worker/form";
import type { Ticket } from "../worker/registrations";
import { Check, Field } from "./FormFields";

export type Arrival = { kind: "created" | "exists"; ticket: Ticket };

export type DoorView = {
  event: EventMeta;
  going: number;
  checkedIn: number;
  /** False once the event ended: nobody else comes in. */
  open: boolean;
  form: FormState;
  arrival: Arrival | null;
};

function ArrivalNotice({ kind, ticket }: Arrival) {
  return (
    <p class="notice notice-fresh" role="status">
      {kind === "created"
        ? `#${ticket.number} ${ticket.name} ingresó. Le enviamos su entrada por correo.`
        : `${ticket.name} ya estaba inscrito con la entrada #${ticket.number}. Registramos su ingreso.`}
    </p>
  );
}

function WalkInForm({ slug, form }: { slug: string; form: FormState }) {
  const hasErrors = Object.keys(form.errors).length > 0;
  return (
    <section class="register" aria-labelledby="walk-in-title">
      <h2 class="register-header" id="walk-in-title">
        Llegó sin inscribirse
      </h2>
      <div class="register-content">
        {hasErrors && (
          <p class="notice notice-error" role="alert">
            Revisa los campos marcados.
          </p>
        )}
        <form method="post" action={`/puerta/${slug}/llegada`} novalidate>
          <Field
            name="name"
            label="Nombre y apellido"
            form={form}
            autocomplete="off"
          />
          <Field
            name="email"
            label="Correo"
            type="email"
            inputMode="email"
            form={form}
            autocomplete="off"
            hint="Ahí le llega su entrada."
          />
          <Field
            name="phone"
            label="WhatsApp"
            type="tel"
            inputMode="tel"
            form={form}
            autocomplete="off"
          />
          <Check name="privacy" form={form}>
            Aceptó la <a href="/privacidad">política de privacidad</a>.
          </Check>
          <button class="button button-primary button-full" type="submit">
            Registrar e ingresar
          </button>
        </form>
      </div>
    </section>
  );
}

/** The door of one event: who came in, and the form for who came unannounced. */
export function DoorPage(view: DoorView) {
  const { event } = view;
  return (
    <article class="ticket-page">
      <section class="register" aria-labelledby="door-title">
        <p class="register-header">Puerta</p>
        <div class="register-content">
          <h1 class="ticket-title" id="door-title">
            {event.title}
          </h1>
          <p class="door-who">
            {view.checkedIn} ingresaron · {view.going} con cupo
          </p>
          {view.open ? (
            <p class="ticket-note">
              Para dejar pasar a alguien inscrito, escanea el código QR de su
              entrada con la cámara del teléfono.
            </p>
          ) : (
            <p class="ticket-note">
              El evento terminó. La puerta está cerrada.
            </p>
          )}
        </div>
      </section>
      {view.arrival && <ArrivalNotice {...view.arrival} />}
      {view.open && <WalkInForm slug={event.slug} form={view.form} />}
    </article>
  );
}
