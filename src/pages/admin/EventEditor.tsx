import {
  backdrops,
  fonts,
  kindLabel,
  kinds,
  type Backdrop,
  type Font,
  type Kind,
} from "../../worker/events";
import type { FormState } from "../../worker/form";
import { Mark } from "../Brand";
import { palette as tints, themeClass, themeStyle } from "../theme";
import { Choice, Input, TextArea, Toggle } from "./fields";
import { calendarNotice, ManageFrame } from "./Manage";

const backdropLabel: Record<Backdrop, string> = {
  plain: "Liso",
  grid: "Cuadrícula",
  dots: "Puntos",
  glow: "Resplandor",
};

const fontLabel: Record<Font, string> = {
  sans: "Geist",
  pixel: "Píxel",
  mono: "Mono",
  serif: "Serif",
};

/** Accents that read well on white; any #rrggbb also works. */
const palette = [
  "#0a0a0a",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#16a34a",
];

const accentPattern = /^#[0-9a-f]{6}$/i;

export type EditorView = {
  form: FormState;
  /** An event with registrations keeps its slug. */
  registrations: number;
  coverUrl?: string;
  saved: boolean;
  /** Saving reached the event but Google Calendar refused the update. */
  calendarError: boolean;
};

/** An existing event: the title its manage frame shows, as stored. */
export type EditedEvent = { slug: string; title: string };

export function EventEditor(props: { view: EditorView; event?: EditedEvent }) {
  const { view, event } = props;
  if (!event)
    return (
      <div class="admin">
        <p class="crumbs">
          <a href="/admin">Eventos</a> ›
        </p>
        <div class="admin-head">
          <h1>Crear evento</h1>
        </div>
        <EditorForm view={view} action="/admin/events/new" />
      </div>
    );
  return (
    <ManageFrame slug={event.slug} title={event.title} tab="edit">
      <EditorForm view={view} action={`/admin/events/${event.slug}/edit`} />
    </ManageFrame>
  );
}

function EditorForm({ view, action }: { view: EditorView; action: string }) {
  const { form } = view;
  const hasErrors = Object.keys(form.errors).length > 0;
  return (
    <>
      {view.saved && (
        <p class="notice" role="status">
          Guardado.
        </p>
      )}
      {view.calendarError && (
        <p class="notice notice-error" role="alert">
          {calendarNotice.error}
        </p>
      )}
      {hasErrors && (
        <p class="notice notice-error" role="alert">
          Revisa los campos marcados.
        </p>
      )}

      <form
        class="editor"
        method="post"
        action={action}
        enctype="multipart/form-data"
        novalidate
        style={
          accentPattern.test(form.values.accent ?? "")
            ? `--accent-preview: ${form.values.accent}`
            : undefined
        }
      >
        <fieldset>
          <legend>Lo básico</legend>
          <Input name="title" label="Título" form={form} />
          <SlugField form={form} locked={view.registrations > 0} />
          <TextArea
            name="summary"
            label="Resumen"
            form={form}
            rows={2}
            hint="Una o dos frases para la lista, el calendario y las vistas previas."
          />
          <TextArea
            name="body"
            label="Descripción"
            form={form}
            rows={10}
            hint="Markdown: **negrita**, listas con -, enlaces con [texto](https://...)."
          />
        </fieldset>

        <fieldset>
          <legend>Cuándo y dónde</legend>
          <div class="field-row">
            <Input
              name="start"
              label="Inicio"
              type="datetime-local"
              form={form}
              hint="Hora de Lima."
            />
            <Input name="end" label="Fin" type="datetime-local" form={form} />
          </div>
          <Choice
            name="place_kind"
            label="Lugar"
            form={form}
            options={[
              ["venue", "Presencial"],
              ["online", "En línea"],
            ]}
          />
          <PlaceNameField form={form} />
          <div class="venue-fields">
            <Input
              name="place_address"
              label="Dirección del lugar"
              form={form}
            />
            <PlacePicker form={form} />
          </div>
        </fieldset>

        <fieldset>
          <legend>Inscripción</legend>
          <Input
            name="capacity"
            label="Cupos"
            type="number"
            form={form}
            hint="Vacío para no poner límite. Pasado el límite, la gente entra a la lista de espera."
          />
          <TextArea
            name="questions"
            label="Preguntas extra"
            form={form}
            rows={4}
            hint={
              <>
                Una por línea. <code>Carrera*</code> es obligatoria.{" "}
                <code>Nivel: Básico | Avanzado</code> da opciones. Nombre,
                correo y WhatsApp siempre se piden.
              </>
            }
          />
        </fieldset>

        <fieldset class="look">
          <legend>Hazlo especial</legend>
          <div class="look-controls">
            <Choice
              name="kind"
              label="Tipo"
              form={form}
              options={kinds.map((k) => [k, kindLabel[k]])}
            />
            <AccentField form={form} />
            <Choice
              name="backdrop"
              label="Fondo de la portada"
              form={form}
              swatches
              options={backdrops.map((b) => [b, backdropLabel[b]])}
            />
            <Choice
              name="font"
              label="Letra del título"
              form={form}
              options={fonts.map((f) => [f, fontLabel[f]])}
            />
            <CoverField form={form} coverUrl={view.coverUrl} />
          </div>
          <LookPreview form={form} coverUrl={view.coverUrl} />
        </fieldset>

        <fieldset>
          <legend>Publicación</legend>
          <Choice
            name="status"
            label="Estado"
            form={form}
            options={[
              ["draft", "Borrador: solo lo ven los admins"],
              ["published", "Publicado"],
            ]}
          />
          <Toggle
            name="featured"
            label="Destacar en la portada del sitio"
            form={form}
            hint="Solo un evento a la vez: destacar este quita el destacado del anterior."
          />
          <Input
            name="recording_url"
            label="Grabación"
            type="url"
            form={form}
            hint="Se muestra cuando el evento ya pasó."
          />
        </fieldset>

        <div class="save-bar">
          <button class="button" type="submit">
            Guardar
          </button>
        </div>
      </form>
    </>
  );
}

/** The event's path, typed after the site's address it lives under. */
function SlugField({ form, locked }: { form: FormState; locked: boolean }) {
  const error = form.errors.slug;
  return (
    <div class="field">
      <label for="a-slug">Enlace</label>
      <div class="affix">
        <span aria-hidden="true">up.rising.sh/</span>
        <input
          id="a-slug"
          name="slug"
          value={form.values.slug ?? ""}
          readOnly={locked}
          autocapitalize="off"
          spellcheck={false}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "a-slug-error" : "a-slug-hint"}
        />
      </div>
      {error ? (
        <p class="error" id="a-slug-error">
          {error}
        </p>
      ) : (
        <p class="hint" id="a-slug-hint">
          {locked
            ? "Ya hay inscripciones con este enlace; no cambia."
            : "Minúsculas, números y guiones."}
        </p>
      )}
    </div>
  );
}

/** One field for the venue's name or the platform; CSS swaps its label. */
function PlaceNameField({ form }: { form: FormState }) {
  const error = form.errors.place_name;
  return (
    <div class="field">
      <label for="a-place_name">
        <span class="venue-only">Nombre del lugar</span>
        <span class="online-only">Plataforma</span>
      </label>
      <input
        id="a-place_name"
        name="place_name"
        value={form.values.place_name ?? ""}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? "a-place_name-error" : undefined}
      />
      {error && (
        <p class="error" id="a-place_name-error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The venue's point. The script swaps the two number fields for a search box
 * and a map the admin clicks; without it they stay as they are.
 */
function PlacePicker({ form }: { form: FormState }) {
  const error = form.errors.lat;
  return (
    <div class="field place-picker">
      <span class="field-label" id="a-map-label">
        Ubicación en el mapa
      </span>
      <div class="place-search" hidden>
        <input
          type="search"
          role="combobox"
          aria-labelledby="a-map-label"
          aria-autocomplete="list"
          aria-expanded="false"
          aria-controls="a-place-results"
          list={undefined}
          autocomplete="off"
          placeholder="Busca el lugar o pega un enlace de Google Maps"
        />
        <ul
          id="a-place-results"
          role="listbox"
          aria-labelledby="a-map-label"
          hidden
        />
      </div>
      <div class="place-map" hidden />
      <div class="field-row place-coords">
        <Input name="lat" label="Latitud" form={{ ...form, errors: {} }} />
        <Input name="lng" label="Longitud" form={{ ...form, errors: {} }} />
      </div>
      {error ? (
        <p class="error" id="a-lat-error">
          {error}
        </p>
      ) : (
        <p class="hint place-hint">
          Busca el lugar o haz clic en el mapa; arrastra el pin para ajustarlo.
          Sin ubicación, la página muestra solo la dirección.
        </p>
      )}
      <button class="button button-light place-clear" type="button" hidden>
        Quitar del mapa
      </button>
    </div>
  );
}

function AccentField({ form }: { form: FormState }) {
  const error = form.errors.accent;
  return (
    <div class="field">
      <label for="a-accent">Color</label>
      <div class="accent-picker">
        {palette.map((c) => (
          <button
            key={c}
            type="button"
            class="accent-chip"
            data-accent={c}
            aria-label={`Usar ${c}`}
            aria-pressed={c === form.values.accent ? "true" : "false"}
            style={{ backgroundColor: c }}
            hidden
          />
        ))}
        <input
          id="a-accent"
          name="accent"
          type="color"
          value={form.values.accent}
          list="a-palette"
          title="Otro color"
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "a-accent-error" : "a-accent-hint"}
        />
        <datalist id="a-palette">
          {palette.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <output class="accent-value" for="a-accent">
          {form.values.accent}
        </output>
      </div>
      {error ? (
        <p class="error" id="a-accent-error">
          {error}
        </p>
      ) : (
        <p class="hint" id="a-accent-hint">
          La página entera toma su paleta de este color.
        </p>
      )}
    </div>
  );
}

function CoverField({
  form,
  coverUrl,
}: {
  form: FormState;
  coverUrl?: string;
}) {
  const error = form.errors.cover;
  return (
    <div class="field cover-field">
      <span class="field-label" id="a-cover-label">
        Portada
      </span>
      <label class="cover-drop" data-filled={coverUrl ? "" : undefined}>
        <input
          id="a-cover"
          name="cover"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-labelledby="a-cover-label"
          aria-describedby="a-cover-hint"
          aria-invalid={error ? "true" : undefined}
        />
        <img
          src={coverUrl}
          alt=""
          width={1080}
          height={1080}
          hidden={!coverUrl}
        />
        <span class="cover-empty" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
          </svg>
          <strong>Sube una imagen</strong>
          <span>o arrástrala aquí</span>
        </span>
        <span class="cover-change" aria-hidden="true">
          Cambiar
        </span>
      </label>
      <p class="cover-name" hidden />
      {error ? (
        <p class="error" id="a-cover-hint">
          {error}
        </p>
      ) : (
        <p class="hint" id="a-cover-hint">
          Cuadrada, 1080 × 1080, JPG, PNG o WebP, hasta 5 MB. Sin portada se
          usan el color y el fondo.
        </p>
      )}
      {coverUrl && (
        <div class="check">
          <input id="a-remove-cover" name="remove_cover" type="checkbox" />
          <label for="a-remove-cover">Quitar la portada</label>
        </div>
      )}
    </div>
  );
}

/**
 * The event as its card shows it, in the colors chosen beside it. The script
 * repaints it on every change; without it, it shows the last saved look.
 */
function LookPreview({
  form,
  coverUrl,
}: {
  form: FormState;
  coverUrl?: string;
}) {
  const v = form.values;
  const theme = {
    kind: v.kind as Kind,
    accent: v.accent && accentPattern.test(v.accent) ? v.accent : "#2563eb",
    backdrop: v.backdrop as Backdrop,
    font: v.font as Font,
  };
  const tinted = tints(theme.accent) ? " tinted" : "";
  return (
    <aside class="look-preview" aria-label="Vista previa">
      <p class="field-label" aria-hidden="true">
        Vista previa
      </p>
      <div
        class={`look-card tint ${themeClass(theme)}${tinted}`}
        style={themeStyle(theme)}
      >
        <div class="look-cover">
          <img src={coverUrl} alt="" hidden={!coverUrl} />
          <div class="cover-blank" hidden={Boolean(coverUrl)}>
            <Mark />
          </div>
        </div>
        <div class="look-text">
          <p class="look-kind">
            <span class="kind-dot" aria-hidden="true" />
            <span>{kindLabel[theme.kind] ?? ""}</span>
          </p>
          <p class="look-title">{v.title || "Título del evento"}</p>
          <p class="look-summary">{v.summary}</p>
          <span class="button button-primary">Inscribirme</span>
        </div>
      </div>
    </aside>
  );
}
