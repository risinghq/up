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
    <div class="discover">
      <header class="discover-header">
        <p class="discover-kicker">
          up<span>rising</span>
        </p>
        <h1>Levántate y construye.</h1>
        <p class="discover-desc">
          Mini hackathons, talleres y charlas sobre los proyectos de rising.sh,
          en Lima. Inscríbete, ven y construye con nosotros.
        </p>
      </header>

      {featured && (
        <section class="section" aria-label="Destacado">
          <Spotlight event={featured} />
        </section>
      )}

      <section class="section" aria-labelledby="listing-title">
        <div class="section-title-row">
          <h2 class="section-title" id="listing-title">
            Eventos
          </h2>
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
        <section class="section community" aria-labelledby="community-title">
          <h2 class="section-title" id="community-title">
            Únete a la comunidad
          </h2>
          <p class="community-desc">
            {whatsapp
              ? "Anunciamos cada evento primero en la comunidad de WhatsApp."
              : "Anunciamos cada evento en Instagram."}
          </p>
          <div class="row">
            {whatsapp && (
              <a class="button button-primary" href={whatsapp}>
                Comunidad de WhatsApp
              </a>
            )}
            {instagram && (
              <a class="button button-light" href={instagram}>
                Instagram
              </a>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
