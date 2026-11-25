import { within } from "@testing-library/dom";
import { Window } from "happy-dom";

/** A parsed HTML document, queried as a person reads it: by role and label. */
export function parse(html: string) {
  const window = new Window({ url: "https://up.test/" });
  window.document.write(html);
  const document = window.document as unknown as Document;
  const screen = within(document.body);

  return {
    document,
    screen,

    /** The content of a `<meta>` by its name or property, or null. */
    meta: (key: string) =>
      document
        .querySelector(`meta[property="${key}"], meta[name="${key}"]`)
        ?.getAttribute("content") ?? null,

    /** The href of a `<link>` by its rel, or null. */
    link: (rel: string) =>
      document.querySelector(`link[rel="${rel}"]`)?.getAttribute("href") ??
      null,

    /**
     * A button by its label, shown or not: the client unhides some buttons,
     * and Testing Library computes no name for a hidden element.
     */
    button: (name: string) =>
      screen
        .queryAllByRole("button", { hidden: true })
        .find(
          (b) =>
            (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name,
        ) ?? null,

    /** The text a control's aria-describedby points at: its error or hint. */
    message: (control: Element) =>
      (control.getAttribute("aria-describedby") ?? "")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .join(" "),

    /** An element's text with its whitespace collapsed. */
    text: (selector: string) =>
      document
        .querySelector(selector)
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ?? null,
  };
}

export type Page = ReturnType<typeof parse> & {
  status: number;
  headers: Headers;
};

/** Reads a response's page. */
export async function page(res: Response): Promise<Page> {
  return {
    status: res.status,
    headers: res.headers,
    ...parse(await res.text()),
  };
}
