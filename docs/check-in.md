# Check in at the door

Open the door on your phone, then scan the QR code on a registrant's ticket with
the camera app. The ticket opens with a **Puerta** panel on top:

```
Puerta
#12 Ana Pérez · Tiene cupo
[ Registrar ingreso ]
```

**Registrar ingreso** records the time. The panel then shows **Ingresó a las
3:05 p. m.** and a **Deshacer** link that clears it.

The ticket of an event at a venue shows the QR code while the ticket holds a
seat or a place on the waitlist. An online event's ticket has none. Once the
holder is in, their ticket shows **Ingresaste a las …** in place of the code,
and they can no longer cancel.

A waitlisted ticket can check in: the panel says **Está en lista de espera** and
the door decides. A cancelled ticket cannot.

## Who works the door

An admin works the door of every event, signed in on the phone.

A voluntario works the door of one event without an account. On the event's
**Equipo** tab, **Enlace de puerta** next to the voluntario shows a link once:

```
https://up.rising.sh/puerta/abrir/<token>
```

Send it to the voluntario. Opening it on their phone sets a cookie for seven
days and lands on the door page. The door closes for them when the event ends.
**Nuevo enlace** replaces the link and the old one stops working. **Quitar**
removes the role and the link with it. **Salir de la puerta** on the door page
drops the cookie.

## The door page

`/puerta/<slug>` shows the event, a count such as **12 ingresaron · 40 con
cupo**, and the form for someone who arrives without registering. An admin
reaches it from **Puerta** on the **Inscritos** tab.

**Llegó sin inscribirse** takes a name, an email, a WhatsApp number and the
privacy consent, then registers and checks the person in at once. A walk-in gets
a seat even when the event is full, and their ticket goes out by email and
WhatsApp. An email that already holds a ticket checks that ticket in instead.
The event's questions are not asked.

## From the list

Without a QR, open the **Inscritos** tab of the event. The **Ingreso** column
holds a **Registrar** button per ticket, or the time of the check-in. The
summary line counts who came in.
