import env from '../config/env.config.js';
import { createCipher } from './cipher.util.js';

// Field-level encryption for sensitive health text (notes), configured from the environment.
// See docs/key-rotation.md for changing the key.
const cipher = createCipher({
  keyId: env.encryptionKeyId,
  key: env.encryptionKey,
  oldKeys: env.oldEncryptionKeys,
});

export const { encrypt, decrypt, needsRotation, rotate } = cipher;
export const currentKeyId = cipher.keyId;
