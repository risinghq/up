# Share that you are going

A ticket holder opens their ticket and presses **Compartir que voy** under
**Cuéntale a tus amigos**. The panel then shows a link to copy and a **Compartir
por WhatsApp** button:

```
https://up.rising.sh/hackathon-ml-fisica/going/t5layru7ff3AnPISLxdt3A
```

The link opens a page that says **Lucía va a** over the event, with a button to
register. Once the event has ended it says **Lucía fue a**. Chats and social
networks preview it with a 1200×630 card that shows the same text.

The page shows the holder's first name and nothing else about them. It does not
open the ticket, and search engines do not index it.

Cancelling the ticket ends the link. Registering again ends it too, and the new
ticket makes a new one.

## The card's fonts

After a `@fontsource/geist` upgrade, rewrite the card's fonts:

```sh
bun install
scripts/card-fonts.sh
```

The script needs `uvx`.
