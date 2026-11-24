import {
  backdrops,
  kindLabel,
  kinds,
  type Backdrop,
} from "../../worker/events";
import type { FormState } from "../../worker/form";
import { Choice, Input, TextArea, Toggle } from "./fields";

const backdropLabel: Record<Backdrop, string> = {
  plain: "Liso",
  grid: "Cuadrícula",
  dots: "Puntos",
  glow: "Resplandor",
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
  /** The slug of the event being edited; absent for a new event. */
  slug?: string;
  /** An event with registrations keeps its slug. */
  registrations: number;
  coverUrl?: string;
  saved: boolean;
  deleteError?: string;
};

export function EventEditor(view: EditorView) {
  const { form, slug } = view;
  const action = slug ? `/admin/eventos/${slug}` : "/admin/eventos/nuevo";
  const locked = view.registrations > 0;
  const online = form.values.place_kind === "online";
  const hasErrors = Object.keys(form.errors).length > 0;
  return (
    <div class="admin">
      <p class="crumbs">
        <a href="/admin">Admin</a> /{" "}
        {slug ? form.values.title || slug : "Nuevo evento"}
      </p>
      <div class="admin-head">
        <h1>{slug ? "Editar evento" : "Nuevo evento"}</h1>
        {slug && (
          <p>
            <a href={`/${slug}`}>Ver página</a> ·{" "}
            <a href={`/admin/eventos/${slug}/inscritos`}>
              {view.registrations} inscripciones
            </a>
          </p>
        )}
      </div>
      {view.saved && (
        <p class="notice" role="status">
          Guardado.
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
            label="Enlace al mapa"
            type="url"
            form={form}
            placeholder="https://maps.google.com/?q=..."
          />
        </fieldset>

        <fieldset>
          <legend>Inscripción</legend>
          <Input
            name="hosts"
            label="Organizan"
            form={form}
            hint="Nombres separados por comas."
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

        <fieldset class="make-special">
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
              <input
                id="a-accent"
                name="accent"
                type="color"
                value={form.values.accent}
                list="a-palette"
                aria-invalid={form.errors.accent ? "true" : undefined}
              />
              <datalist id="a-palette">
                {palette.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <span class="hint">
                Botones, portada y etiqueta usan este color. El texto encima
                elige negro o blanco solo.
              </span>
            </div>
            {form.errors.accent && <p class="error">{form.errors.accent}</p>}
          </div>
          <Choice
            name="backdrop"
            label="Fondo de la portada"
            form={form}
            swatches
            options={backdrops.map((b) => [b, backdropLabel[b]])}
          />
          <div class="field">
            <label for="a-cover">Portada</label>
            {view.coverUrl && (
              <img
                class="cover-preview"
                src={view.coverUrl}
                alt="Portada actual"
                width={1200}
                height={630}
              />
            )}
            <input
              id="a-cover"
              name="cover"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-invalid={form.errors.cover ? "true" : undefined}
            />
            {form.errors.cover ? (
              <p class="error">{form.errors.cover}</p>
            ) : (
              <p class="hint">
                1200 × 630, JPG, PNG o WebP, hasta 5 MB. Sin portada se usa el
                color y el fondo.
              </p>
            )}
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

      {slug && (
        <section class="danger" aria-labelledby="delete-title">
          <h2 id="delete-title">Eliminar</h2>
          {locked ? (
            <p>
              Este evento tiene inscripciones, así que no se puede eliminar.
              Déjalo en borrador para ocultarlo.
            </p>
          ) : (
            <form
              method="post"
              action={`/admin/eventos/${slug}/eliminar`}
              data-confirm="¿Eliminar este evento? No se puede deshacer."
            >
              <button class="button button-quiet" type="submit">
                Eliminar evento
              </button>
            </form>
          )}
          {view.deleteError && (
            <p class="error" role="alert">
              {view.deleteError}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
