import {
  backdrops,
  fonts,
  kindLabel,
  kinds,
  type Backdrop,
  type Font,
} from "../../worker/events";
import type { FormState } from "../../worker/form";
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
        <EditorForm view={view} action="/admin/eventos/nuevo" />
      </div>
    );
  return (
    <ManageFrame slug={event.slug} title={event.title} tab="editar">
      <EditorForm view={view} action={`/admin/eventos/${event.slug}/editar`} />
    </ManageFrame>
  );
}

function EditorForm({ view, action }: { view: EditorView; action: string }) {
  const { form } = view;
  const locked = view.registrations > 0;
  const online = form.values.place_kind === "online";
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
      >
        <fieldset>
          <legend>Lo básico</legend>
          <Input name="title" label="Título" form={form} />
          <Input
            name="slug"
            label="Dirección"
            form={form}
            readOnly={locked}
            hint={
              locked
                ? "Ya hay inscripciones con esta dirección; no cambia."
                : "up.rising.sh/<dirección>. Minúsculas, números y guiones."
            }
          />
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
          <Input
            name="place_name"
            label={online ? "Plataforma" : "Nombre del lugar"}
            form={form}
          />
          <Input
            name="place_address"
            label="Dirección del lugar"
            form={form}
            hint="Vacío si es en línea."
          />
          <Input
            name="map_url"
            label="Mapa"
            form={form}
            placeholder="https://maps.app.goo.gl/... o -12.0599, -77.0817"
            hint="Un enlace de Google Maps o las coordenadas del lugar. La página muestra el mapa cuando hay coordenadas."
          />
        </fieldset>

        <fieldset>
          <legend>Inscripción</legend>
          <Input
            name="hosts"
            label="Organizan"
            form={form}
            hint="Nombres separados por comas. Con el correo, el evento aparece en el perfil de esa persona: Ana Quispe <ana@correo.com>. El correo no se muestra."
          />
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

        <fieldset
          class="make-special"
          style={
            /^#[0-9a-f]{6}$/i.test(form.values.accent ?? "")
              ? `--accent-preview: ${form.values.accent}`
              : undefined
          }
        >
          <legend>Hazlo especial</legend>
          <Choice
            name="kind"
            label="Tipo"
            form={form}
            options={kinds.map((k) => [k, kindLabel[k]])}
          />
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
                aria-invalid={form.errors.accent ? "true" : undefined}
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
            {form.errors.accent ? (
              <p class="error">{form.errors.accent}</p>
            ) : (
              <p class="hint">
                La página entera toma su paleta de este color: fondo, botones y
                textos secundarios.
              </p>
            )}
          </div>
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
          <div class="field cover-field">
            <span class="field-label" id="a-cover-label">
              Portada
            </span>
            <div class="cover-row">
              <label
                class="cover-drop"
                data-filled={view.coverUrl ? "" : undefined}
              >
                <input
                  id="a-cover"
                  name="cover"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-labelledby="a-cover-label"
                  aria-describedby="a-cover-hint"
                  aria-invalid={form.errors.cover ? "true" : undefined}
                />
                <img
                  src={view.coverUrl}
                  alt=""
                  width={1080}
                  height={1080}
                  hidden={!view.coverUrl}
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
              <div class="cover-side">
                {form.errors.cover ? (
                  <p class="error" id="a-cover-hint">
                    {form.errors.cover}
                  </p>
                ) : (
                  <p class="hint" id="a-cover-hint">
                    Cuadrada, 1080 × 1080, JPG, PNG o WebP, hasta 5 MB. Sin
                    portada se usa el color y el fondo.
                  </p>
                )}
                <p class="cover-name" hidden />
                {view.coverUrl && (
                  <div class="check">
                    <input
                      id="a-remove-cover"
                      name="remove_cover"
                      type="checkbox"
                    />
                    <label for="a-remove-cover">Quitar la portada</label>
                  </div>
                )}
              </div>
            </div>
          </div>
          <Toggle
            name="featured"
            label="Destacar en la portada del sitio"
            form={form}
            hint="Solo un evento a la vez: destacar este quita el destacado del anterior."
          />
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
          <Input
            name="recording_url"
            label="Grabación"
            type="url"
            form={form}
            hint="Se muestra cuando el evento ya pasó."
          />
        </fieldset>

        <button class="button" type="submit">
          Guardar
        </button>
      </form>
    </>
  );
}
