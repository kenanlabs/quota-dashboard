const crypto = require('crypto');
const config = require('../config');

const PREFIX = 'enc:v1:';
const AAD = Buffer.from('quota-dashboard-secret-v1', 'utf8');

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encryptSecret(value) {
  if (value === null || value === undefined || value === '') return value ?? null;
  if (isEncrypted(value)) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', config.dataEncryptionKey, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(String(value), 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

function decryptSecret(value) {
  if (value === null || value === undefined || value === '') return value ?? null;
  if (!isEncrypted(value)) return value;

  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted secret');

  const [ivBase64, tagBase64, ciphertextBase64] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    config.dataEncryptionKey,
    Buffer.from(ivBase64, 'base64')
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function encryptJson(value) {
  return value === null || value === undefined ? null : encryptSecret(JSON.stringify(value));
}

function decryptJson(value) {
  if (value === null || value === undefined || value === '') return null;
  try {
    return JSON.parse(decryptSecret(value));
  } catch (_) {
    return null;
  }
}

module.exports = {
  isEncrypted,
  encryptSecret,
  decryptSecret,
  encryptJson,
  decryptJson
};
