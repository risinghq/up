import type { EventMeta } from "../../worker/events";
import type { FormState } from "../../worker/form";
import { roleLabel, roles, type EventRole } from "../../worker/roles";
import { Choice, Input } from "./fields";
import { ManageFrame } from "./Manage";

export type DoorLink = { name: string; url: string };

export type TeamView = {
  event: EventMeta;
  team: EventRole[];
  form: FormState;
  /** A door link just made; it is shown this once. */
  doorLink?: DoorLink;
  /** True once the event is published and over: each role has a certificate. */
  certificates: boolean;
};

function Member({
  slug,
  person,
  certificates,
}: {
  slug: string;
  person: EventRole;
  certificates: boolean;
}) {
  const base = `/admin/eventos/${slug}/equipo/${person.id}`;
  return (
    <li class="team-member">
      <span>
        {person.name}
        {person.email && <span class="team-email"> · {person.email}</span>}
      </span>
      <span class="actions">
        {certificates && (
          <a
            class="button button-small button-light"
            href={`/c/${person.certificateId}`}
            aria-label={`Certificado de ${person.name} (${roleLabel[person.role].one})`}
          >
            Certificado
          </a>
        )}
        {person.role === "voluntario" && !certificates && (
          <form method="post" action={`${base}/puerta`}>
            <button
              class="button button-small button-light"
              type="submit"
              aria-label={`${person.door ? "Nuevo enlace de puerta" : "Crear enlace de puerta"} para ${person.name}`}
            >
              {person.door ? "Nuevo enlace" : "Enlace de puerta"}
            </button>
          </form>
        )}
        <form method="post" action={`${base}/quitar`}>
          <button
            class="button button-small button-quiet"
            type="submit"
            aria-label={`Quitar a ${person.name} (${roleLabel[person.role].one})`}
          >
            Quitar
          </button>
        </form>
      </span>
    </li>
  );
}

function DoorLinkNotice({ name, url }: DoorLink) {
  return (
    <div class="notice" role="status">
      <p>
        Envía este enlace a {name}. Abre la puerta del evento en su teléfono
        hasta que termine. Solo se muestra ahora; un enlace nuevo anula el
        anterior.
      </p>
      <p class="invite-url">
        <code>{url}</code>{" "}
        <button
          class="button button-small button-quiet"
          type="button"
          data-copy={url}
          hidden
        >
          Copiar
        </button>
      </p>
    </div>
  );
}

/** The people of one event by role, and the form that gives someone a role. */
export function Team({ event, team, form, doorLink, certificates }: TeamView) {
  const groups = roles
    .map((role) => ({ role, people: team.filter((p) => p.role === role) }))
    .filter((group) => group.people.length);
  const hasErrors = Object.keys(form.errors).length > 0;

  return (
    <ManageFrame slug={event.slug} title={event.title} tab="equipo">
      {doorLink && <DoorLinkNotice {...doorLink} />}
      {groups.length ? (
        groups.map((group) => (
          <section
            key={group.role}
            class="manage-card"
            aria-labelledby={`rol-${group.role}`}
          >
            <h2 id={`rol-${group.role}`}>{roleLabel[group.role].many}</h2>
            <ul class="team-list">
              {group.people.map((person) => (
                <Member
                  key={person.id}
                  slug={event.slug}
                  person={person}
                  certificates={certificates}
                />
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p class="empty-state">
          Nadie tiene un rol en este evento todavía. La página del evento
          muestra aquí a quien organiza, da charlas, mentorea, evalúa o ayuda.
        </p>
      )}

      <section class="manage-card" aria-labelledby="agregar">
        <h2 id="agregar">Agregar a alguien</h2>
        {hasErrors && (
          <p class="notice notice-error" role="alert">
            Revisa los campos marcados.
          </p>
        )}
        <form
          class="editor"
          method="post"
          action={`/admin/eventos/${event.slug}/equipo`}
          novalidate
        >
          <Input name="name" label="Nombre" form={form} />
          <Input
            name="email"
            label="Correo"
            type="email"
            form={form}
            hint="Opcional. Con el correo, el evento aparece en el perfil público de esa persona. El correo no se muestra."
          />
          <Choice
            name="role"
            label="Rol"
            form={form}
            options={roles.map((role) => [role, roleLabel[role].one])}
          />
          <button class="button button-primary" type="submit">
            Agregar
          </button>
        </form>
      </section>
    </ManageFrame>
  );
}
