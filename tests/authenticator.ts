import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";

// A software passkey: a P-256 key that answers WebAuthn ceremonies the way a
// browser and platform authenticator do, with "none" attestation.

const bytes = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

const sha256 = async (data: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));

const utf8 = (text: string) => new TextEncoder().encode(text);

/** An ECDSA signature from WebCrypto (r‖s) as the DER sequence WebAuthn sends. */
function der(raw: Uint8Array) {
  const int = (n: Uint8Array) => {
    let i = 0;
    while (i < n.length - 1 && n[i] === 0) i++;
    const v = n.slice(i);
    const body = (v[0] ?? 0) & 0x80 ? bytes(new Uint8Array([0]), v) : v;
    return bytes(new Uint8Array([0x02, body.length]), body);
  };
  const seq = bytes(int(raw.slice(0, 32)), int(raw.slice(32)));
  return bytes(new Uint8Array([0x30, seq.length]), seq);
}

export async function softPasskey(origin: string) {
  const rpId = new URL(origin).hostname;
  const keys = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const id = crypto.getRandomValues(new Uint8Array(16));
  const idText = isoBase64URL.fromBuffer(id);
  let counter = 0;

  const clientData = (type: string, challenge: string) =>
    utf8(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

  const authData = async (flags: number, extra = new Uint8Array()) => {
    const count = new Uint8Array(4);
    new DataView(count.buffer).setUint32(0, counter);
    return bytes(
      await sha256(utf8(rpId)),
      new Uint8Array([flags]),
      count,
      extra,
    );
  };

  return {
    id: idText,

    async create(challenge: string) {
      const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
      const cose = isoCBOR.encode(
        new Map<number, number | Uint8Array>([
          [1, 2], // kty: EC2
          [3, -7], // alg: ES256
          [-1, 1], // crv: P-256
          [-2, isoBase64URL.toBuffer(jwk.x ?? "")],
          [-3, isoBase64URL.toBuffer(jwk.y ?? "")],
        ]),
      );
      const idLength = new Uint8Array([0, id.length]);
      const attested = bytes(new Uint8Array(16), idLength, id, cose);
      // Flags: user present, user verified, attested credential data.
      const data = await authData(0x01 | 0x04 | 0x40, attested);
      const attestationObject = isoCBOR.encode(
        new Map<string, string | Uint8Array | Map<string, never>>([
          ["fmt", "none"],
          ["attStmt", new Map<string, never>()],
          ["authData", data],
        ]),
      );
      return {
        id: idText,
        rawId: idText,
        type: "public-key" as const,
        clientExtensionResults: {},
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(
            clientData("webauthn.create", challenge),
          ),
          attestationObject: isoBase64URL.fromBuffer(attestationObject),
          transports: ["internal" as const],
        },
      };
    },

    async get(challenge: string) {
      counter += 1;
      const data = await authData(0x01 | 0x04);
      const client = clientData("webauthn.get", challenge);
      const signed = bytes(data, await sha256(client));
      const signature = new Uint8Array(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          keys.privateKey,
          signed,
        ),
      );
      return {
        id: idText,
        rawId: idText,
        type: "public-key" as const,
        clientExtensionResults: {},
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(client),
          authenticatorData: isoBase64URL.fromBuffer(data),
          signature: isoBase64URL.fromBuffer(der(signature)),
        },
      };
    },
  };
}
