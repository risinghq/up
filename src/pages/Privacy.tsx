// The policy that the register form's privacy checkbox accepts (Ley 29733).
// Change it with care: a registration stores the date it was accepted, not
// the text.
export function Privacy() {
  return (
    <article class="prose page">
      <h1>Privacidad</h1>
      <p>
        up.rising.sh es la página de eventos de rising.sh. Aquí explicamos qué
        datos pedimos al inscribirte, para qué los usamos y cómo pedir que los
        borremos.
      </p>

      <h2>Qué datos pedimos</h2>
      <ul>
        <li>Tu nombre, tu correo y tu número de WhatsApp.</li>
        <li>
          Las respuestas a las preguntas de cada evento, como tu universidad o
          tu carrera.
        </li>
      </ul>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>
          Para confirmar tu cupo y avisarte de cambios del evento al que te
          inscribiste.
        </li>
        <li>Para saber quién asistió y preparar mejor los próximos eventos.</li>
        <li>
          Si marcas la casilla de novedades, para avisarte por WhatsApp de los
          próximos eventos. Puedes pedir que dejemos de hacerlo en cualquier
          momento.
        </li>
      </ul>
      <p>No vendemos ni compartimos tus datos con terceros.</p>

      <h2>Dónde se guardan</h2>
      <p>
        En una base de datos de Cloudflare, a la que solo acceden los
        organizadores de rising.sh. Los guardamos mientras rising.sh organice
        eventos, o hasta que pidas que los borremos.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes pedir ver, corregir o borrar tus datos, o dejar de recibir
        novedades, escribiendo a{" "}
        <a href="mailto:david@rising.sh">david@rising.sh</a> desde el correo con
        el que te inscribiste. Respondemos en un plazo de diez días hábiles.
      </p>
    </article>
  );
}
