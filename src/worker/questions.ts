import type { Question } from "./events";

/** "¿Cuánto Python sabes?" -> "cuanto-python-sabes" */
export const slugify = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/**
 * Reads the questions an admin types one per line. `Label*` is required and
 * `Label: A | B | C` is a choice. A question's id is its slugified label, so
 * renaming a question starts a new column of answers.
 */
export function parseQuestions(text: string): Question[] {
  const seen = new Set<string>();
  const questions: Question[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    const isChoice = colon > 0 && line.slice(colon).includes("|");
    let label = (isChoice ? line.slice(0, colon) : line).trim();
    const required = label.endsWith("*");
    if (required) label = label.slice(0, -1).trim();
    const base = slugify(label) || "pregunta";
    let id = base;
    for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
    seen.add(id);
    const options = isChoice
      ? line
          .slice(colon + 1)
          .split("|")
          .map((o) => o.trim())
          .filter(Boolean)
      : [];
    questions.push({
      id,
      label: label.slice(0, 200),
      ...(required ? { required } : {}),
      ...(options.length ? { options } : {}),
    });
  }
  return questions;
}

export const formatQuestions = (questions: Question[]) =>
  questions
    .map(
      (q) =>
        `${q.label}${q.required ? "*" : ""}${q.options ? `: ${q.options.join(" | ")}` : ""}`,
    )
    .join("\n");
