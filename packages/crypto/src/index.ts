import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

const { decodeBase64, decodeUTF8, encodeBase64, encodeUTF8 } = naclUtil;

export interface DeviceKeyPair {
  publicKey: string;
  secretKey: string;
}

export interface SigningKeyPair {
  publicKey: string;
  secretKey: string;
}

export interface SealedMessage {
  ciphertext: string;
  nonce: string;
}

export interface IdentityBundle {
  identity: SigningKeyPair;
  device: DeviceKeyPair;
  signedPrekey: DeviceKeyPair;
  oneTimePrekey: DeviceKeyPair;
}

export interface PrekeyBundle {
  identityPublicKey: string;
  devicePublicKey: string;
  signedPrekeyPublicKey: string;
  signedPrekeySignature: string;
  oneTimePrekeyPublicKey: string;
}

export interface SessionMaterial {
  sessionId: string;
  protection: "ratcheted";
  rootKey: string;
  sendingChainKey: string;
  receivingChainKey: string;
  counter: number;
  peerCounter: number;
  peerDevicePublicKey: string;
}

export interface RatchetedCiphertext {
  ciphertext: string;
  nonce: string;
  counter: number;
}

export interface SenderKeyState {
  senderId: string;
  epoch: number;
  key: string;
}

function bytesToBase64(bytes: Uint8Array) {
  return encodeBase64(bytes);
}

function randomBytes(length: number) {
  return bytesToBase64(nacl.randomBytes(length));
}

export function bytesFromBase64(input: string) {
  return decodeBase64(input);
}

export function bytesToBase64String(bytes: Uint8Array) {
  return encodeBase64(bytes);
}

async function sha256(input: string) {
  const payload = Uint8Array.from(decodeUTF8(input));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", payload);
  return bytesToBase64(new Uint8Array(digest));
}

async function deriveKey(seed: string, label: string) {
  return sha256(`${label}:${seed}`);
}

export function generateDeviceKeyPair(): DeviceKeyPair {
  const keyPair = nacl.box.keyPair();

  return {
    publicKey: bytesToBase64(keyPair.publicKey),
    secretKey: bytesToBase64(keyPair.secretKey),
  };
}

export function generateSigningKeyPair(): SigningKeyPair {
  const keyPair = nacl.sign.keyPair();

  return {
    publicKey: bytesToBase64(keyPair.publicKey),
    secretKey: bytesToBase64(keyPair.secretKey),
  };
}

export function generateIdentityBundle(): IdentityBundle {
  return {
    identity: generateSigningKeyPair(),
    device: generateDeviceKeyPair(),
    signedPrekey: generateDeviceKeyPair(),
    oneTimePrekey: generateDeviceKeyPair(),
  };
}

export function createPrekeyBundle(bundle: IdentityBundle): PrekeyBundle {
  const signature = nacl.sign.detached(
    decodeBase64(bundle.signedPrekey.publicKey),
    decodeBase64(bundle.identity.secretKey),
  );

  return {
    identityPublicKey: bundle.identity.publicKey,
    devicePublicKey: bundle.device.publicKey,
    signedPrekeyPublicKey: bundle.signedPrekey.publicKey,
    signedPrekeySignature: bytesToBase64(signature),
    oneTimePrekeyPublicKey: bundle.oneTimePrekey.publicKey,
  };
}

export function verifyPrekeyBundle(bundle: PrekeyBundle) {
  return nacl.sign.detached.verify(
    decodeBase64(bundle.signedPrekeyPublicKey),
    decodeBase64(bundle.signedPrekeySignature),
    decodeBase64(bundle.identityPublicKey),
  );
}

export async function establishSession(
  localDeviceSecretKey: string,
  peerBundle: PrekeyBundle,
) {
  if (!verifyPrekeyBundle(peerBundle)) {
    throw new Error("Peer prekey bundle signature is invalid.");
  }

  const sharedSecret = nacl.box.before(
    decodeBase64(peerBundle.signedPrekeyPublicKey),
    decodeBase64(localDeviceSecretKey),
  );
  const rootSeed = `${bytesToBase64(sharedSecret)}:${peerBundle.oneTimePrekeyPublicKey}`;
  const rootKey = await deriveKey(rootSeed, "root");

  return {
    sessionId: (await sha256(`${rootKey}:${peerBundle.devicePublicKey}`)).slice(
      0,
      24,
    ),
    protection: "ratcheted" as const,
    rootKey,
    sendingChainKey: await deriveKey(rootKey, "send"),
    receivingChainKey: await deriveKey(rootKey, "recv"),
    counter: 0,
    peerCounter: 0,
    peerDevicePublicKey: peerBundle.devicePublicKey,
  };
}

export async function ratchetEncrypt(
  session: SessionMaterial,
  plaintext: string,
): Promise<{ session: SessionMaterial; message: RatchetedCiphertext }> {
  const nextCounter = session.counter + 1;
  const messageKey = await deriveKey(
    `${session.sendingChainKey}:${nextCounter}`,
    "message",
  );
  const nextChainKey = await deriveKey(session.sendingChainKey, "chain");
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(
    decodeUTF8(plaintext),
    nonce,
    decodeBase64(messageKey),
  );

  return {
    session: {
      ...session,
      counter: nextCounter,
      sendingChainKey: nextChainKey,
    },
    message: {
      ciphertext: bytesToBase64(ciphertext),
      nonce: bytesToBase64(nonce),
      counter: nextCounter,
    },
  };
}

export async function ratchetDecrypt(
  session: SessionMaterial,
  message: RatchetedCiphertext,
): Promise<{ session: SessionMaterial; plaintext: string }> {
  if (message.counter < session.peerCounter + 1) {
    throw new Error("Replay detected for ratcheted message.");
  }

  let derivedKey = session.receivingChainKey;
  let derivedCounter = session.peerCounter;

  while (derivedCounter < message.counter) {
    derivedCounter += 1;
    if (derivedCounter === message.counter) {
      derivedKey = await deriveKey(`${derivedKey}:${derivedCounter}`, "message");
    } else {
      derivedKey = await deriveKey(derivedKey, "chain");
    }
  }

  const plaintext = nacl.secretbox.open(
    decodeBase64(message.ciphertext),
    decodeBase64(message.nonce),
    decodeBase64(derivedKey),
  );

  if (!plaintext) {
    throw new Error("Unable to decrypt ratcheted message.");
  }

  const nextReceivingChainKey = await deriveKey(
    session.receivingChainKey,
    "chain",
  );

  return {
    session: {
      ...session,
      peerCounter: message.counter,
      receivingChainKey: nextReceivingChainKey,
    },
    plaintext: encodeUTF8(plaintext),
  };
}

export function createSenderKeyState(senderId: string): SenderKeyState {
  return {
    senderId,
    epoch: 1,
    key: randomBytes(32),
  };
}

export function rotateSenderKey(state: SenderKeyState): SenderKeyState {
  return {
    ...state,
    epoch: state.epoch + 1,
    key: randomBytes(32),
  };
}

export function encryptGroupMessage(senderKey: SenderKeyState, plaintext: string) {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(
    decodeUTF8(plaintext),
    nonce,
    decodeBase64(senderKey.key),
  );

  return {
    epoch: senderKey.epoch,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
  };
}

export function decryptGroupMessage(
  senderKey: SenderKeyState,
  message: { nonce: string; ciphertext: string },
) {
  const plaintext = nacl.secretbox.open(
    decodeBase64(message.ciphertext),
    decodeBase64(message.nonce),
    decodeBase64(senderKey.key),
  );

  if (!plaintext) {
    throw new Error("Unable to decrypt sender-key message.");
  }

  return encodeUTF8(plaintext);
}

export function encryptDirectMessage(
  plaintext: string,
  senderSecretKey: string,
  recipientPublicKey: string,
): SealedMessage {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const payload = decodeUTF8(plaintext);
  const encrypted = nacl.box(
    payload,
    nonce,
    decodeBase64(recipientPublicKey),
    decodeBase64(senderSecretKey),
  );

  return {
    ciphertext: bytesToBase64(encrypted),
    nonce: bytesToBase64(nonce),
  };
}

export function decryptDirectMessage(
  message: SealedMessage,
  recipientSecretKey: string,
  senderPublicKey: string,
): string {
  const opened = nacl.box.open(
    decodeBase64(message.ciphertext),
    decodeBase64(message.nonce),
    decodeBase64(senderPublicKey),
    decodeBase64(recipientSecretKey),
  );

  if (!opened) {
    throw new Error("Unable to decrypt sealed message.");
  }

  return encodeUTF8(opened);
}

export function createAttachmentKey() {
  return randomBytes(32);
}

export function createAttachmentNonce() {
  return randomBytes(nacl.secretbox.nonceLength);
}

export function encryptAttachmentBytes(
  payload: Uint8Array,
  secret: string,
  nonce: string,
) {
  return nacl.secretbox(payload, decodeBase64(nonce), decodeBase64(secret));
}

export function decryptAttachmentBytes(
  payload: Uint8Array,
  secret: string,
  nonce: string,
) {
  const opened = nacl.secretbox.open(
    payload,
    decodeBase64(nonce),
    decodeBase64(secret),
  );

  if (!opened) {
    throw new Error("Unable to decrypt attachment payload.");
  }

  return opened;
}

export function fingerprintKey(publicKey: string) {
  return publicKey.replaceAll("/", "").replaceAll("+", "").slice(0, 16);
}
