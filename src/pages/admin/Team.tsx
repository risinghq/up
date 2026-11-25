import type { EventMeta } from "../../worker/events";
import type { FormState } from "../../worker/form";
import { roleLabel, roles, type EventRole } from "../../worker/roles";
import { Choice, Input } from "./fields";
import { ManageFrame } from "./Manage";

export type TeamView = {
  event: EventMeta;
  team: EventRole[];
  form: FormState;
};

function Member({ slug, person }: { slug: string; person: EventRole }) {
  return (
    <li class="team-member">
      <span>
        {person.name}
        {person.email && <span class="team-email"> · {person.email}</span>}
      </span>
      <form
        method="post"
        action={`/admin/eventos/${slug}/equipo/${person.id}/quitar`}
      >
        <button
          class="button button-small button-quiet"
          type="submit"
          aria-label={`Quitar a ${person.name} (${roleLabel[person.role].one})`}
        >
          Quitar
        </button>
      </form>
    </li>
  );
}

/** The people of one event by role, and the form that gives someone a role. */
export function Team({ event, team, form }: TeamView) {
  const groups = roles
    .map((role) => ({ role, people: team.filter((p) => p.role === role) }))
    .filter((group) => group.people.length);
  const hasErrors = Object.keys(form.errors).length > 0;

  return (
    <ManageFrame slug={event.slug} title={event.title} tab="equipo">
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
                <Member key={person.id} slug={event.slug} person={person} />
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
