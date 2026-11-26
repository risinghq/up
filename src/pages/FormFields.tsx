import type { ComponentChildren } from "preact";
import type { FormState } from "../worker/form";

/** A labelled input with its hint, or its error once the form was refused. */
export function Field(props: {
  name: string;
  label: string;
  form: FormState;
  type?: "text" | "email" | "tel";
  autocomplete?: string;
  inputMode?: "tel" | "email" | "text";
  hint?: string;
  required?: boolean;
  focus?: boolean;
}) {
  const error = props.form.errors[props.name];
  const id = `f-${props.name}`;
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      <input
        id={id}
        name={props.name}
        type={(props.type ?? "text") as "text"}
        value={props.form.values[props.name] ?? ""}
        autoComplete={props.autocomplete}
        inputMode={props.inputMode}
        required={props.required ?? true}
        autoFocus={props.focus}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={
          error ? `${id}-error` : props.hint ? `${id}-hint` : undefined
        }
      />
      {props.hint && !error && (
        <p class="hint" id={`${id}-hint`}>
          {props.hint}
        </p>
      )}
      {error && (
        <p class="error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function Check(props: {
  name: string;
  form: FormState;
  children: ComponentChildren;
  focus?: boolean;
}) {
  const error = props.form.errors[props.name];
  const id = `f-${props.name}`;
  return (
    <div class="check">
      <input
        id={id}
        name={props.name}
        type="checkbox"
        checked={props.form.values[props.name] === "on"}
        autoFocus={props.focus}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <label for={id}>{props.children}</label>
      {error && (
        <p class="error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
