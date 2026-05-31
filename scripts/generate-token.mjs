#!/usr/bin/env node

const LICENSE_TOKEN_SECRET = "MYDOMPET-LIFETIME-2026";
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const buyer = process.argv.slice(2).join(" ").trim();
const token = createLicenseToken();

console.log(token);
if (buyer) console.log(`Buyer: ${buyer}`);

function createLicenseToken() {
  const payload = randomTokenText(8);
  return `MD-${payload.slice(0, 4)}-${payload.slice(4)}-${licenseChecksum(payload)}`;
}

function randomTokenText(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]).join("");
}

function licenseChecksum(payload) {
  let hash = 2166136261;
  const source = `${LICENSE_TOKEN_SECRET}:${payload}`;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  let value = hash;
  let checksum = "";
  for (let index = 0; index < 4; index += 1) {
    checksum += TOKEN_ALPHABET[value % TOKEN_ALPHABET.length];
    value = Math.floor(value / TOKEN_ALPHABET.length);
  }

  return checksum;
}
