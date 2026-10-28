import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM field encryption with KEY IDS, so the key can be changed without losing data.
//
//   stored value:  <keyId>:<iv>:<authTag>:<ciphertext>      (hex parts)
//   legacy value:  <iv>:<authTag>:<ciphertext>              (written before keys had ids)
//
// The current key encrypts everything new. Retired keys are only used to read values that have not
// been re-encrypted yet (`npm run rotate-key` does that). No environment, no database: pure, so it
// can be tested with any keys.
const KEY_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const HEX_KEY_RE = /^[0-9a-fA-F]{64}$/;
// Only full 16-byte tags are accepted. Node would otherwise accept a truncated (weaker) tag.
const TAG_BYTES = 16;
const IV_BYTES = 12;

export const createCipher = ({ keyId, key, oldKeys = [] }) => {
  const keyring = new Map();
  for (const { id, key: hex } of [{ id: keyId, key }, ...oldKeys]) {
    if (!KEY_ID_RE.test(id ?? '')) throw new Error('An encryption key id must be 1-32 letters, digits, "-" or "_"');
    if (!HEX_KEY_RE.test(hex ?? '')) throw new Error(`Encryption key "${id}" must be 32 bytes as 64 hex characters`);
    if (keyring.has(id)) throw new Error(`Encryption key id "${id}" is used twice`);
    keyring.set(id, Buffer.from(hex, 'hex'));
  }

  const open = (keyBuffer, ivHex, tagHex, dataHex) => {
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('Malformed encrypted value');
    const decipher = createDecipheriv('aes-256-gcm', keyBuffer, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  };

  const encrypt = (plainText) => {
    if (plainText == null) return plainText;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', keyring.get(keyId), iv, { authTagLength: TAG_BYTES });
    const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    return [keyId, iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
  };

  const decrypt = (payload) => {
    if (payload == null) return payload;
    const parts = String(payload).split(':');
    if (parts.length === 4) {
      const [id, iv, tag, data] = parts;
      const keyBuffer = keyring.get(id);
      if (!keyBuffer) throw new Error(`Encrypted with key "${id}", which is not configured`);
      return open(keyBuffer, iv, tag, data);
    }
    if (parts.length === 3) {
      // No key id on this one. The authentication tag tells us which configured key fits.
      for (const keyBuffer of keyring.values()) {
        try { return open(keyBuffer, ...parts); } catch { /* wrong key, try the next */ }
      }
      throw new Error('A value without a key id could not be decrypted with any configured key');
    }
    throw new Error('Not an encrypted value');
  };

  // True for anything not already encrypted with the current key.
  const needsRotation = (payload) => {
    if (payload == null) return false;
    const parts = String(payload).split(':');
    return !(parts.length === 4 && parts[0] === keyId);
  };

  const rotate = (payload) => (needsRotation(payload) ? encrypt(decrypt(payload)) : payload);

  return { keyId, encrypt, decrypt, needsRotation, rotate };
};
