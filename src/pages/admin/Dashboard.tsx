import type { Admin } from "../../worker/auth";
import { kindLabel, type EventMeta } from "../../worker/events";
import { shortDate } from "../../worker/time";
import { themeStyle } from "../theme";

export type DashboardEvent = {
  event: EventMeta;
  going: number;
  ended: boolean;
};

export type NewInvite = { name: string; url: string };

export function Dashboard(props: {
  admin: Admin;
  events: DashboardEvent[];
  admins: Admin[];
  invite?: NewInvite;
  inviteError?: string;
}) {
  return (
    <div class="admin">
      <div class="admin-head">
        <h1>Hola, {props.admin.name}</h1>
        <a class="button" href="/admin/eventos/nuevo">
          Nuevo evento
        </a>
      </div>

      <section aria-labelledby="events-title">
        <h2 id="events-title">Eventos</h2>
        {props.events.length ? (
          <ul class="admin-events">
            {props.events.map(({ event, going, ended }) => (
              <li key={event.slug} style={themeStyle(event.theme)}>
                <span class="kind-dot" aria-hidden="true" />
                <div>
                  <a href={`/admin/eventos/${event.slug}`}>{event.title}</a>
                  <p>
                    {kindLabel[event.theme.kind]} · {shortDate(event.start)}
                    {" · "}
                    {event.status === "draft"
                      ? "Borrador"
                      : ended
                        ? "Pasado"
                        : "Publicado"}
                    {event.featured && " · Destacado"}
                  </p>
                </div>
                <a href={`/admin/eventos/${event.slug}/inscritos`}>
                  {going}
                  {event.capacity !== undefined && ` / ${event.capacity}`}{" "}
                  inscritos
                </a>
                <a href={`/${event.slug}`}>Ver</a>
              </li>
            ))}
          </ul>
        ) : (
          <p class="empty">Todavía no hay eventos. Crea el primero.</p>
        )}
      </section>

      <section aria-labelledby="admins-title">
        <h2 id="admins-title">Admins</h2>
        <ul class="admin-people">
          {props.admins.map((a) => (
            <li key={a.id}>{a.name}</li>
          ))}
        </ul>
        {props.invite && (
          <div class="notice" role="status">
            <p>
              Envía este enlace a {props.invite.name}. Sirve una vez y vence en
              7 días:
            </p>
            <p class="invite-url">
              <code>{props.invite.url}</code>{" "}
              <button
                class="button button-small button-quiet"
                type="button"
                data-copy={props.invite.url}
                hidden
              >
                Copiar
              </button>
            </p>
          </div>
        )}
        <form method="post" action="/admin/invitaciones" class="inline-form">
          <div class="field">
            <label for="a-invite-name">Invitar a un admin</label>
            <input
              id="a-invite-name"
              name="name"
              placeholder="Nombre"
              aria-invalid={props.inviteError ? "true" : undefined}
              aria-describedby={
                props.inviteError ? "a-invite-name-error" : undefined
              }
            />
            {props.inviteError && (
              <p class="error" id="a-invite-name-error">
                {props.inviteError}
              </p>
            )}
          </div>
          <button class="button button-quiet" type="submit">
            Crear invitación
          </button>
        </form>
      </section>

      <form method="post" action="/admin/salir">
        <button class="link-button" type="submit">
          Salir
        </button>
      </form>
    </div>
  );
}
