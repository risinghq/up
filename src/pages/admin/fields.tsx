import type { ComponentChildren } from "preact";
import type { FormState } from "../../worker/form";

type FieldProps = {
  name: string;
  label: string;
  form: FormState;
  hint?: ComponentChildren;
};

function Message({ id, form, name, hint }: FieldProps & { id: string }) {
  const error = form.errors[name];
  if (error)
    return (
      <p class="error" id={`${id}-error`}>
        {error}
      </p>
    );
  return hint ? (
    <p class="hint" id={`${id}-hint`}>
      {hint}
    </p>
  ) : null;
}

const described = ({ name, form, hint }: FieldProps, id: string) => ({
  "aria-invalid": form.errors[name] ? ("true" as const) : undefined,
  "aria-describedby": form.errors[name]
    ? `${id}-error`
    : hint
      ? `${id}-hint`
      : undefined,
});

export function Input(
  props: FieldProps & {
    type?: "text" | "email" | "url" | "number" | "datetime-local" | "color";
    readOnly?: boolean;
    placeholder?: string;
  },
) {
  const id = `a-${props.name}`;
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      <input
        id={id}
        name={props.name}
        // Preact types each input type separately and rejects a union.
        type={(props.type ?? "text") as "text"}
        value={props.form.values[props.name] ?? ""}
        readOnly={props.readOnly}
        placeholder={props.placeholder}
        {...described(props, id)}
      />
      <Message {...props} id={id} />
    </div>
  );
}

export function TextArea(props: FieldProps & { rows?: number }) {
  const id = `a-${props.name}`;
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      <textarea
        id={id}
        name={props.name}
        rows={props.rows ?? 4}
        {...described(props, id)}
      >
        {props.form.values[props.name] ?? ""}
      </textarea>
      <Message {...props} id={id} />
    </div>
  );
}

/** A group of radio buttons; each option is [value, label]. */
export function Choice(
  props: FieldProps & { options: [string, string][]; swatches?: boolean },
) {
  const id = `a-${props.name}`;
  const current = props.form.values[props.name];
  return (
    <fieldset class="field choice" {...described(props, id)}>
      <legend>{props.label}</legend>
      <div
        class={props.swatches ? "choice-options swatches" : "choice-options"}
      >
        {props.options.map(([value, label]) => (
          <label key={value} class={props.swatches ? `swatch-${value}` : ""}>
            <input
              type="radio"
              name={props.name}
              value={value}
              checked={current === value}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <Message {...props} id={id} />
    </fieldset>
  );
}

export function Toggle(props: FieldProps) {
  const id = `a-${props.name}`;
  return (
    <div class="check">
      <input
        id={id}
        name={props.name}
        type="checkbox"
        checked={props.form.values[props.name] === "on"}
        {...described(props, id)}
      />
      <label for={id}>{props.label}</label>
      <Message {...props} id={id} />
    </div>
  );
}
