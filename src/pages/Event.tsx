import { micromark } from "micromark";
import {
  coverUrl,
  kindLabel,
  type EventMeta,
  type Question,
} from "../worker/events";
import type { FormState } from "../worker/form";
import { clock, longDate } from "../worker/time";
import { DateTile } from "./EventCard";
import { themeClass, themeStyle } from "./theme";

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

function Check(props: {
  name: string;
  form: FormState;
  children: preact.ComponentChildren;
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

function RegisterCard(view: EventView) {
  const meta = view.event;
  if (view.ended) {
    return (
      <section class="card register" aria-labelledby="register-title">
        <h2 id="register-title">Este evento ya pasó</h2>
        {meta.recordingUrl ? (
          <a class="button" href={meta.recordingUrl}>
            Ver la grabación
          </a>
        ) : (
          <p>Gracias a todos los que vinieron.</p>
        )}
      </section>
    );
  }

  const full = meta.capacity !== undefined && view.going >= meta.capacity;
  const left =
    meta.capacity !== undefined
      ? Math.max(meta.capacity - view.going, 0)
      : null;
  const hasErrors = Object.keys(view.form.errors).length > 0;

  return (
    <section class="card register" aria-labelledby="register-title">
      <h2 id="register-title">{full ? "Lista de espera" : "Inscríbete"}</h2>
      <p class="register-lede">
        {full
          ? "Los cupos se llenaron. Si alguien cancela, la primera persona en espera recibe su cupo."
          : left !== null
            ? `Quedan ${left} de ${meta.capacity} cupos. La inscripción es gratuita.`
            : "La inscripción es gratuita."}
      </p>
      {view.notice === "exists" && (
        <p class="notice" role="status">
          Este correo ya está inscrito. Abre el enlace de tu entrada que
          guardaste al inscribirte.
        </p>
      )}
      {hasErrors && (
        <p class="notice notice-error" role="alert">
          Revisa los campos marcados.
        </p>
      )}
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
          <input
            id="f-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        <button class="button button-block" type="submit">
          {full ? "Unirme a la lista de espera" : "Inscribirme"}
        </button>
      </form>
    </section>
  );
}

export function EventPage(view: EventView) {
  const meta = view.event;
  const place = meta.place;
  const cover = coverUrl(meta);
  return (
    <article
      class={`event ${themeClass(meta.theme)}`}
      style={themeStyle(meta.theme)}
    >
      {cover ? (
        <img class="event-cover" src={cover} alt="" width={1200} height={630} />
      ) : (
        <div class="event-cover event-cover-blank" aria-hidden="true">
          <span>{meta.title}</span>
        </div>
      )}
      <div class="event-main">
        {meta.status === "draft" && (
          <p class="draft">Borrador: solo los admins lo ven.</p>
        )}
        {view.admin && (
          <p class="admin-bar">
            <a href={`/admin/eventos/${meta.slug}`}>Editar</a> ·{" "}
            <a href={`/admin/eventos/${meta.slug}/inscritos`}>Inscritos</a>
          </p>
        )}
        <p class="kind-chip">{kindLabel[meta.theme.kind]}</p>
        <h1>{meta.title}</h1>
        <ul class="facts">
          <li>
            <DateTile iso={meta.start} />
            <div>
              <p class="fact-title">{longDate(meta.start)}</p>
              <p>
                {clock(meta.start)} a {clock(meta.end)} · hora de Lima ·{" "}
                <a href={view.calendarUrl}>Google Calendar</a> ·{" "}
                <a href={`/${meta.slug}/calendario.ics`}>.ics</a>
              </p>
            </div>
          </li>
          <li>
            <span class="fact-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21Z"
                />
                <circle
                  cx="12"
                  cy="9.5"
                  r="2.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                />
              </svg>
            </span>
            <div>
              {place.kind === "venue" ? (
                <>
                  <p class="fact-title">
                    {place.mapUrl ? (
                      <a href={place.mapUrl}>{place.name}</a>
                    ) : (
                      place.name
                    )}
                  </p>
                  <p>{place.address}</p>
                </>
              ) : (
                <>
                  <p class="fact-title">En línea</p>
                  <p>{place.platform}. El enlace llega a tu entrada.</p>
                </>
              )}
            </div>
          </li>
        </ul>

        <RegisterCard {...view} />

        {meta.body.trim() && (
          <section class="about" aria-labelledby="about-title">
            <h2 id="about-title">Sobre el evento</h2>
            {/* micromark escapes raw HTML and drops javascript: links. */}
            <div
              class="prose"
              dangerouslySetInnerHTML={{ __html: micromark(meta.body) }}
            />
          </section>
        )}
      </div>
      <section class="hosts" aria-labelledby="hosts-title">
        <h2 id="hosts-title">Organizan</h2>
        <ul>
          {meta.hosts.map((host) => (
            <li key={host}>
              <span class="avatar" aria-hidden="true">
                {host.slice(0, 1)}
              </span>
              {host}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
