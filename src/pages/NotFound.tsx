export function NotFound({ what }: { what: "page" | "ticket" }) {
  return (
    <article class="prose links page">
      <h1>
        {what === "ticket"
          ? "No encontramos esa entrada"
          : "No encontramos esta página"}
      </h1>
      <p>
        {what === "ticket"
          ? "Revisa que el enlace esté completo. Es el que recibiste al inscribirte."
          : "Puede que el evento haya cambiado de dirección."}{" "}
        <a href="/">Ver los eventos</a>.
      </p>
    </article>
  );
}
