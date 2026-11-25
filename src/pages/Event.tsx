import { micromark } from "micromark";
import type { ComponentChildren } from "preact";
import {
  kindTag,
  mapLink,
  type EventMeta,
  type Question,
} from "../worker/events";
import type { FormState } from "../worker/form";
import { ArrowIcon, Cover, DateRow, PlaceRow } from "./EventCard";

/** Why the register card shows what it shows. */
export type Notice = "exists" | null;

export type EventView = {
  event: EventMeta;
  going: number;
  ended: boolean;
  form: FormState;
  notice: Notice;
  calendarUrl: string;
  /** A signed-in admin sees links to edit the event. */
  admin: boolean;
  /** The Turnstile site key; with it, the form carries the widget. */
  turnstileKey: string | null;
};

function Field(props: {
  name: string;
  label: string;
  form: FormState;
  type?: "text" | "email" | "tel";
  autocomplete?: string;
  inputMode?: "tel" | "email" | "text";
  hint?: string;
  required?: boolean;
}) {
  const error = props.form.errors[props.name];
  const id = `f-${props.name}`;
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      <input
        id={id}
        name={props.name}
        type={(props.type ?? "text") as "text"}
        value={props.form.values[props.name] ?? ""}
        autoComplete={props.autocomplete}
        inputMode={props.inputMode}
        required={props.required ?? true}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={
          error ? `${id}-error` : props.hint ? `${id}-hint` : undefined
        }
      />
      {props.hint && !error && (
        <p class="hint" id={`${id}-hint`}>
          {props.hint}
        </p>
      )}
      {error && (
        <p class="error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function QuestionField({ q, form }: { q: Question; form: FormState }) {
  const name = `q_${q.id}`;
  if (!q.options)
    return (
      <Field name={name} label={q.label} form={form} required={q.required} />
    );
  const error = form.errors[name];
  const id = `f-${name}`;
  return (
    <div class="field">
      <label for={id}>{q.label}</label>
      <select
        id={id}
        name={name}
        required={q.required}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        <option value="">Elige una opción</option>
        {q.options.map((option) => (
          <option
            key={option}
            value={option}
            selected={form.values[name] === option}
          >
            {option}
          </option>
        ))}
      </select>
      {error && (
        <p class="error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

/** The Turnstile widget's place. main.ts renders it when the form opens. */
function HumanCheck(props: { siteKey: string; error: string | undefined }) {
  return (
    <div class="human-check">
      <div class="turnstile" data-sitekey={props.siteKey} />
      {props.error ? (
        <p class="error" role="alert">
          {props.error}
        </p>
      ) : (
        <noscript>
          <p class="hint">
            Activa JavaScript para inscribirte: lo usamos para frenar a los
            bots.
          </p>
        </noscript>
      )}
    </div>
  );
}

function Check(props: {
  name: string;
  form: FormState;
  children: ComponentChildren;
}) {
  const error = props.form.errors[props.name];
  const id = `f-${props.name}`;
  return (
    <div class="check">
      <input
        id={id}
        name={props.name}
        type="checkbox"
        checked={props.form.values[props.name] === "on"}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <label for={id}>{props.children}</label>
      {error && (
        <p class="error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

/** A content card with a small label over a divider, as on Luma. */
function Card(props: {
  label: string;
  id: string;
  children: ComponentChildren;
}) {
  return (
    <section class="content-card" aria-labelledby={props.id}>
      <h2 class="card-title" id={props.id}>
        {props.label}
      </h2>
      {props.children}
    </section>
  );
}

function RegisterCard(view: EventView) {
  const meta = view.event;
  if (view.ended) {
    return (
      <section class="register" aria-labelledby="register-title">
        <h2 class="register-header" id="register-title">
          Este evento ya pasó
        </h2>
        <div class="register-content">
          {meta.recordingUrl ? (
            <>
              <p>La grabación está disponible.</p>
              <a
                class="button button-primary button-full"
                href={meta.recordingUrl}
              >
                Ver la grabación
              </a>
            </>
          ) : (
            <p>Gracias a todos los que vinieron.</p>
          )}
        </div>
      </section>
    );
  }

  const full = meta.capacity !== undefined && view.going >= meta.capacity;
  const left =
    meta.capacity !== undefined
      ? Math.max(meta.capacity - view.going, 0)
      : null;
  const hasErrors = Object.keys(view.form.errors).length > 0;
  const action = full ? "Unirme a la lista de espera" : "Inscribirme";

  return (
    <section class="register" aria-labelledby="register-title">
      <h2 class="register-header" id="register-title">
        {full ? "Lista de espera" : "Inscripción"}
      </h2>
      <div class="register-content">
        <p>
          {full
            ? "Los cupos se llenaron. Si alguien cancela, la primera persona en espera recibe su cupo."
            : left !== null
              ? `¡Bienvenido! Quedan ${left} de ${meta.capacity} cupos. La inscripción es gratuita.`
              : "¡Bienvenido! Para unirte al evento, inscríbete. Es gratis."}
        </p>
        {view.notice === "exists" && (
          <p class="notice" role="status">
            Este correo ya está inscrito. Te enviamos el enlace de tu entrada a
            ese correo.
          </p>
        )}
        {hasErrors && (
          <p class="notice notice-error" role="alert">
            Revisa los campos marcados.
          </p>
        )}
        {/* The form opens in place, as Luma's opens a modal, so the
            description is not buried under it. A failed post reopens it. */}
        <details
          class="register-details"
          id="inscripcion"
          open={hasErrors || view.notice !== null}
        >
          <summary class="button button-primary button-full">{action}</summary>
          <RegisterForm view={view} action={action} />
        </details>
      </div>
    </section>
  );
}

function RegisterForm({ view, action }: { view: EventView; action: string }) {
  const meta = view.event;
  return (
    <form method="post" action={`/${meta.slug}`} novalidate>
      <Field
        name="name"
        label="Nombre y apellido"
        form={view.form}
        autocomplete="name"
      />
      <Field
        name="email"
        label="Correo"
        type="email"
        inputMode="email"
        form={view.form}
        autocomplete="email"
      />
      <Field
        name="phone"
        label="WhatsApp"
        type="tel"
        inputMode="tel"
        form={view.form}
        autocomplete="tel"
        hint="Te escribimos solo sobre este evento. Fuera del Perú, empieza con +código."
      />
      {meta.questions.map((q) => (
        <QuestionField key={q.id} q={q} form={view.form} />
      ))}
      <Check name="news" form={view.form}>
        Avísenme por WhatsApp de los próximos eventos.
      </Check>
      <Check name="privacy" form={view.form}>
        Acepto la <a href="/privacidad">política de privacidad</a>.
      </Check>
      {/* A field people never see; a bot that fills it is refused. */}
      <div class="trap" aria-hidden="true">
        <label for="f-website">No llenar</label>
        <input id="f-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {view.turnstileKey && (
        <HumanCheck
          siteKey={view.turnstileKey}
          error={view.form.errors.human}
        />
      )}
      <button class="button button-primary button-full" type="submit">
        {action}
      </button>
    </form>
  );
}

/** Hosts and the event's kind: the left column on desktop, last on mobile. */
function Sidebar({ event, only }: { event: EventMeta; only: string }) {
  const kind = kindTag(event);
  return (
    <div class={`sidebar ${only}`}>
      <Card label="Organizan" id={`hosts-${only}`}>
        <ul class="hosts">
          {event.hosts.map((host) => (
            <li key={host} class="host">
              <span class="avatar" aria-hidden="true">
                {host.slice(0, 1)}
              </span>
              {host}
            </li>
          ))}
        </ul>
      </Card>
      {kind && (
        <p class="categories">
          <span class="category">
            <span class="kind-dot" aria-hidden="true" />
            {kind}
          </span>
        </p>
      )}
    </div>
  );
}

export function EventPage(view: EventView) {
  const meta = view.event;
  const place = meta.place;
  return (
    <article class="event">
      <div class="event-content">
        <div class="event-left">
          <Cover event={meta} />
          <Sidebar event={meta} only="desktop-only" />
        </div>
        <div class="event-right">
          <header class="top">
            {meta.status === "draft" && (
              <p class="draft">Borrador: solo los admins lo ven.</p>
            )}
            {view.admin && (
              <p class="admin-bar">
                <a href={`/admin/eventos/${meta.slug}`}>Gestionar</a> ·{" "}
                <a href={`/admin/eventos/${meta.slug}/editar`}>Editar</a> ·{" "}
                <a href={`/admin/eventos/${meta.slug}/inscritos`}>Inscritos</a>
              </p>
            )}
            <h1 class="event-title">{meta.title}</h1>
            <div class="meta">
              <DateRow event={meta} />
              <PlaceRow event={meta} />
            </div>
            <p class="add-calendar">
              <a
                class="button button-light button-small button-round"
                href={view.calendarUrl}
              >
                Google Calendar
                <ArrowIcon />
              </a>
              <a
                class="button button-light button-small button-round"
                href={`/${meta.slug}/calendario.ics`}
              >
                Descargar .ics
              </a>
            </p>
          </header>

          <RegisterCard {...view} />

          {meta.body.trim() && (
            <Card label="Sobre el evento" id="about-title">
              {/* micromark escapes raw HTML and drops javascript: links. */}
              <div
                class="spark"
                dangerouslySetInnerHTML={{ __html: micromark(meta.body) }}
              />
            </Card>
          )}

          {place.kind === "venue" && (
            <Card label="Lugar" id="place-title">
              <p class="place">{place.name}</p>
              <p class="street">{place.address}</p>
              {place.point ? (
                <div
                  class="venue-map"
                  data-lat={place.point.lat}
                  data-lng={place.point.lng}
                >
                  <a
                    class="venue-map-link"
                    href={mapLink(place)}
                    rel="noopener"
                    aria-label="Ver en el mapa"
                  />
                </div>
              ) : (
                place.mapUrl && (
                  <p class="place-map">
                    <a href={place.mapUrl} rel="noopener">
                      Ver en el mapa
                    </a>
                  </p>
                )
              )}
            </Card>
          )}

          <Sidebar event={meta} only="mobile-only" />
        </div>
      </div>
    </article>
  );
}
