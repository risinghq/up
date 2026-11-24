import type { EventMeta } from "../worker/events";
import { EventCard, Spotlight } from "./EventCard";
import type { Community } from "./Layout";

export type Tab = "proximos" | "pasados";

export function Home(props: {
  upcoming: EventMeta[];
  past: EventMeta[];
  tab: Tab;
  community: Community;
}) {
  const featured =
    props.tab === "proximos"
      ? props.upcoming.find((e) => e.featured && e.status === "published")
      : undefined;
  const list = props.tab === "proximos" ? props.upcoming : props.past;
  const { whatsapp, instagram } = props.community;
  return (
    <>
      <section class="hero">
        <h1>Donde construimos juntos.</h1>
        <p>
          Mini hackathons, talleres y charlas sobre los proyectos de rising.sh.
          Inscríbete, ven y construye con nosotros.
        </p>
      </section>

      {featured && <Spotlight event={featured} />}

      <section class="listing" aria-labelledby="listing-title">
        <div class="listing-head">
          <h2 id="listing-title">Eventos</h2>
          <nav class="tabs" aria-label="Filtrar eventos">
            <a
              href="/"
              aria-current={props.tab === "proximos" ? "page" : undefined}
            >
              Próximos <span>{props.upcoming.length}</span>
            </a>
            <a
              href="/?ver=pasados"
              aria-current={props.tab === "pasados" ? "page" : undefined}
            >
              Pasados <span>{props.past.length}</span>
            </a>
          </nav>
        </div>
        {list.length ? (
          <ul class="event-list">
            {list.map((event) => (
              <EventCard
                key={event.slug}
                event={event}
                past={props.tab === "pasados"}
              />
            ))}
          </ul>
        ) : (
          <p class="empty">
            {props.tab === "proximos"
              ? "Pronto anunciamos el próximo evento."
              : "Todavía no hay eventos pasados."}
            {props.tab === "proximos" &&
              (whatsapp || instagram) &&
              " Síguenos para enterarte primero."}
          </p>
        )}
      </section>

      {(whatsapp || instagram) && (
        <section class="community">
          <h2>Únete a la comunidad</h2>
          <p>
            {whatsapp
              ? "Anunciamos cada evento primero en la comunidad de WhatsApp."
              : "Anunciamos cada evento en Instagram."}
          </p>
          <div class="community-links">
            {whatsapp && (
              <a class="button" href={whatsapp}>
                Comunidad de WhatsApp
              </a>
            )}
            {instagram && (
              <a class="button button-quiet" href={instagram}>
                Instagram
              </a>
            )}
          </div>
        </section>
      )}
    </>
  );
}
