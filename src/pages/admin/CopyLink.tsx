/** A link to send someone, with a button that copies it once scripts run. */
export function CopyLink({ url }: { url: string }) {
  return (
    <p class="copy-link">
      <code>{url}</code>
      <button
        class="button button-small button-quiet"
        type="button"
        data-copy={url}
        hidden
      >
        Copiar
      </button>
    </p>
  );
}
