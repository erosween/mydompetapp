#!/usr/bin/env node

const LICENSE_TOKEN_SECRET = "MYDOMPET-LIFETIME-2026";
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const { buyer, options } = parseArgs(process.argv.slice(2));
const token = createLicenseToken();

console.log(token);
if (buyer) console.log(`Buyer: ${buyer}`);
if (options.app && options.api) console.log(`Setup link: ${createSetupLink(options.app, options.api, token, buyer, options)}`);

function parseArgs(args) {
  const options = {};
  const buyerParts = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg.startsWith("--app=")) {
      options.app = arg.slice(6);
    } else if (arg === "--app" && next) {
      options.app = next;
      index += 1;
    } else if (arg.startsWith("--api=")) {
      options.api = arg.slice(6);
    } else if (arg === "--api" && next) {
      options.api = next;
      index += 1;
    } else if (arg.startsWith("--owner=")) {
      options.owner = arg.slice(8);
    } else if (arg === "--owner" && next) {
      options.owner = next;
      index += 1;
    } else if (arg.startsWith("--budget=")) {
      options.budget = arg.slice(9);
    } else if (arg === "--budget" && next) {
      options.budget = next;
      index += 1;
    } else {
      buyerParts.push(arg);
    }
  }

  return { buyer: buyerParts.join(" ").trim(), options };
}

function createSetupLink(appUrl, apiUrl, licenseToken, buyerName, options) {
  const url = new URL(appUrl);
  url.searchParams.set("api", apiUrl);
  url.searchParams.set("token", licenseToken);

  const owner = options.owner || buyerName;
  if (owner) url.searchParams.set("owner", owner);
  if (options.budget) url.searchParams.set("budget", options.budget);

  return url.toString();
}

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
