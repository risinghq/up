import type { EventMeta } from "../../worker/events";
import type { Registrant, Status } from "../../worker/registrations";
import { clock } from "../../worker/time";
import { ManageFrame } from "./Manage";

function CheckIn({ registrant: r }: { registrant: Registrant }) {
  if (r.checkedInAt) return <>{clock(r.checkedInAt)}</>;
  if (r.status === "cancelled") return null;
  return (
    <form method="post" action={`/admin/entrada/${r.token}/ingreso`}>
      <input type="hidden" name="volver" value="inscritos" />
      <button class="button button-light button-small" type="submit">
        Registrar
      </button>
    </form>
  );
}

const statusLabel: Record<Status, string> = {
  going: "Con cupo",
  waitlist: "En espera",
  cancelled: "Canceló",
};

export function Registrants(props: {
  event: EventMeta;
  registrants: Registrant[];
}) {
  const { event, registrants } = props;
  const count = (s: Status) => registrants.filter((r) => r.status === s).length;
  return (
    <ManageFrame slug={event.slug} title={event.title} tab="inscritos">
      <div class="section-head">
        <p>
          {count("going")} con cupo
          {event.capacity !== undefined && ` de ${event.capacity}`} ·{" "}
          {count("waitlist")} en espera · {count("cancelled")} cancelaron ·{" "}
          {registrants.filter((r) => r.checkedInAt).length} ingresaron
        </p>
        <a
          class="button button-light button-small"
          href={`/admin/eventos/${event.slug}/inscritos.csv`}
        >
          Descargar CSV
        </a>
      </div>
      {registrants.length ? (
        <div class="table-wrap">
          <table class="registrants">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Nombre</th>
                <th scope="col">WhatsApp</th>
                <th scope="col">Correo</th>
                <th scope="col">Estado</th>
                <th scope="col">Ingreso</th>
                {event.questions.map((q) => (
                  <th key={q.id} scope="col">
                    {q.label}
                  </th>
                ))}
                <th scope="col">Novedades</th>
              </tr>
            </thead>
            <tbody>
              {registrants.map((r) => (
                <tr
                  key={r.number}
                  id={`n${r.number}`}
                  class={`status-${r.status}`}
                >
                  <td>{r.number}</td>
                  <td>{r.name}</td>
                  <td>
                    <a href={`https://wa.me/${r.phone.slice(1)}`}>{r.phone}</a>
                  </td>
                  <td class="registrant-email">{r.email}</td>
                  <td data-label="Estado">{statusLabel[r.status]}</td>
                  <td data-label="Ingreso">
                    <CheckIn registrant={r} />
                  </td>
                  {event.questions.map((q) => (
                    <td key={q.id} data-label={q.label}>
                      {r.answers[q.id] ?? ""}
                    </td>
                  ))}
                  <td data-label="Novedades">{r.newsOptIn ? "Sí" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p class="empty">Todavía nadie se inscribió.</p>
      )}
    </ManageFrame>
  );
}
