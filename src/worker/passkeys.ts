import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { NewCredential, StoredCredential } from "./auth";

/** The relying party is the site's own origin, from SITE_URL. */
export type RelyingParty = { id: string; origin: string };

export const relyingParty = (siteUrl: string): RelyingParty => {
  const url = new URL(siteUrl);
  return { id: url.hostname, origin: url.origin };
};

export function registrationOptions(rp: RelyingParty, name: string) {
  return generateRegistrationOptions({
    rpName: "up · rising.sh",
    rpID: rp.id,
    userName: name,
    userDisplayName: name,
    attestationType: "none",
    // A discoverable passkey lets sign-in skip the username.
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
  });
}

export async function verifyRegistration(
  rp: RelyingParty,
  response: RegistrationResponseJSON,
  challenge: string,
): Promise<NewCredential | null> {
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    requireUserVerification: false,
  }).catch(() => null);
  if (!result?.verified) return null;
  const { credential } = result.registrationInfo;
  return {
    id: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
  };
}

export const authenticationOptions = (rp: RelyingParty) =>
  generateAuthenticationOptions({ rpID: rp.id, userVerification: "preferred" });

/** Returns the new signature counter, or null when the signature fails. */
export async function verifyAuthentication(
  rp: RelyingParty,
  response: AuthenticationResponseJSON,
  challenge: string,
  stored: StoredCredential,
): Promise<number | null> {
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    requireUserVerification: false,
    credential: {
      id: stored.id,
      publicKey: isoBase64URL.toBuffer(stored.publicKey),
      counter: stored.counter,
      transports: stored.transports as AuthenticatorTransport[],
    },
  }).catch(() => null);
  return result?.verified ? result.authenticationInfo.newCounter : null;
}
