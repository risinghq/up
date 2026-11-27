import type { EventMeta } from "../worker/events";
import { EventCard, Spotlight } from "./EventCard";
import type { Community } from "./Layout";

export type Tab = "upcoming" | "past";

export function Home(props: {
  upcoming: EventMeta[];
  past: EventMeta[];
  tab: Tab;
  community: Community;
}) {
  const featured =
    props.tab === "upcoming"
      ? props.upcoming.find((e) => e.featured && e.status === "published")
      : undefined;
  const list = props.tab === "upcoming" ? props.upcoming : props.past;
  const { whatsapp, instagram } = props.community;
  // The featured event's title is the page heading when there is one.
  const ListingTitle = featured ? "h2" : "h1";
  return (
    <>
      {featured && <Spotlight event={featured} />}
      <div class="discover">
        <section class="section" aria-labelledby="listing-title">
          <div class="section-title-row">
            <ListingTitle class="section-title" id="listing-title">
              Eventos
            </ListingTitle>
            <nav class="tabs" aria-label="Filtrar eventos">
              <a
                href="/"
                aria-current={props.tab === "upcoming" ? "page" : undefined}
              >
                Próximos <span>{props.upcoming.length}</span>
              </a>
              <a
                href="/?period=past"
                aria-current={props.tab === "past" ? "page" : undefined}
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
                  past={props.tab === "past"}
                />
              ))}
            </ul>
          ) : (
            <p class="empty">
              {props.tab === "upcoming"
                ? "Pronto anunciamos el próximo evento."
                : "Todavía no hay eventos pasados."}
              {props.tab === "upcoming" &&
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
    </>
  );
}
