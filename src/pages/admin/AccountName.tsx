/** An account's name, with its email on the line below when it has one. */
export function AccountName({
  name,
  email,
}: {
  name: string;
  email: string | null;
}) {
  return (
    <span>
      {name}
      {email && (
        <>
          <br />
          <span class="team-email">{email}</span>
        </>
      )}
    </span>
  );
}
