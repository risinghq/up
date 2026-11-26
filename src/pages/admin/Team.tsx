import type { Account } from "../../worker/accounts";
import type { EventMeta } from "../../worker/events";
import {
  roleLabel,
  roles,
  type EventRole,
  type Role,
} from "../../worker/roles";
import { AccountName } from "./AccountName";
import { CopyLink } from "./CopyLink";
import { Choice, Input } from "./fields";
import { ManageFrame } from "./Manage";

export type TeamSearch = {
  query: string;
  role: Role;
  /** The accounts that match, or null before a query long enough to run. */
  results: Account[] | null;
};

export type TeamView = {
  event: EventMeta;
  team: EventRole[];
  search: TeamSearch;
  error?: string;
  /** Where a person without an account makes one. */
  signInUrl: string;
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
  return (
    <li class="team-member">
      <AccountName name={person.name} email={person.email} />
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
      </span>
    </li>
  );
}

function Result({
  slug,
  account,
  role,
}: {
  slug: string;
  account: Account;
  role: Role;
}) {
  return (
    <li class="team-member">
      <AccountName name={account.name} email={account.email} />
      <form method="post" action={`/admin/eventos/${slug}/equipo`}>
        <input type="hidden" name="person" value={account.id} />
        <input type="hidden" name="role" value={role} />
        <button class="button button-small button-light" type="submit">
          Agregar como {roleLabel[role].one}
        </button>
      </form>
    </li>
  );
}

function NoAccount({ query, url }: { query: string; url: string }) {
  return (
    <div>
      <p>
        Nadie con cuenta coincide con “{query}”. Envía este enlace para que cree
        su cuenta con su correo y vuelve a buscarla.
      </p>
      <CopyLink url={url} />
    </div>
  );
}

function AddPerson({
  slug,
  search,
  signInUrl,
}: {
  slug: string;
  search: TeamSearch;
  signInUrl: string;
}) {
  const form = {
    values: { q: search.query, rol: search.role },
    errors: {},
  };

  return (
    <section class="manage-card" aria-labelledby="agregar">
      <h2 id="agregar">Agregar a alguien</h2>
      <p>
        Cada persona del equipo entra con su cuenta. Quien organiza o es
        voluntario abre la puerta del evento en /puerta/{slug} hasta que
        termine.
      </p>
      <form
        class="team-search"
        method="get"
        action={`/admin/eventos/${slug}/equipo`}
      >
        <Choice
          name="rol"
          label="Rol"
          form={form}
          options={roles.map((role) => [role, roleLabel[role].one])}
        />
        <div class="inline-form">
          <Input
            name="q"
            label="Buscar persona"
            form={form}
            hint="Nombre o correo de su cuenta."
          />
          <button class="button button-quiet" type="submit">
            Buscar
          </button>
        </div>
      </form>
      {search.results &&
        (search.results.length ? (
          <ul class="team-list" aria-label="Resultados">
            {search.results.map((account) => (
              <Result
                key={account.id}
                slug={slug}
                account={account}
                role={search.role}
              />
            ))}
          </ul>
        ) : (
          <NoAccount query={search.query} url={signInUrl} />
        ))}
    </section>
  );
}

/** The people of one event by role, and the search that gives an account a role. */
export function Team({
  event,
  team,
  search,
  error,
  signInUrl,
  certificates,
}: TeamView) {
  const groups = roles
    .map((role) => ({ role, people: team.filter((p) => p.role === role) }))
    .filter((group) => group.people.length);

  return (
    <ManageFrame slug={event.slug} title={event.title} tab="equipo">
      {error && (
        <p class="notice notice-error" role="alert">
          {error}
        </p>
      )}
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

      <AddPerson slug={event.slug} search={search} signInUrl={signInUrl} />
    </ManageFrame>
  );
}
