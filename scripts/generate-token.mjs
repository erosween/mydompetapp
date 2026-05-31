#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const LICENSE_TOKEN_SECRET = "MYDOMPET-LIFETIME-2026";
const LICENSE_REGISTRY_SECRET = "MYDOMPET-REGISTRY-2026";
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REGISTRY_FILE = new URL("../license-registry.json", import.meta.url);

const { buyer, options } = parseArgs(process.argv.slice(2));
const token = options.token ? formatLicenseToken(options.token) : createLicenseToken();

if (!isLicenseTokenValid(token)) {
  throw new Error("Token tidak valid. Pakai token hasil generator my dompet.");
}

if (options.api) {
  await saveRegistryEntry(token, buyer, options);
}

console.log(token);
if (buyer) console.log(`Buyer: ${buyer}`);
if (options.app && options.api) console.log(`Setup link: ${createSetupLink(options.app, options.api, token, buyer, options)}`);
if (options.api) console.log("Registry: license-registry.json updated");
if (options.api) console.log('Next: git add license-registry.json && git commit -m "Add license token" && git push origin main');

function parseArgs(args) {
  const options = { fresh: true };
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
    } else if (arg.startsWith("--token=")) {
      options.token = arg.slice(8);
    } else if (arg === "--token" && next) {
      options.token = next;
      index += 1;
    } else if (arg === "--keep-data") {
      options.fresh = false;
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
  if (options.fresh) url.searchParams.set("fresh", "1");

  return url.toString();
}

async function saveRegistryEntry(licenseToken, buyerName, options) {
  const registry = await readRegistry();
  const payload = {
    apiUrl: options.api,
    owner: options.owner || buyerName || "",
    budget: options.budget || "",
    fresh: Boolean(options.fresh),
    createdAt: new Date().toISOString()
  };

  registry.version = 1;
  registry.updatedAt = new Date().toISOString();
  registry.tokens ||= {};
  registry.tokens[await registryLookupKey(licenseToken)] = await encryptRegistryPayload(licenseToken, payload);

  await writeFile(REGISTRY_FILE, `${JSON.stringify(registry, null, 2)}\n`);
}

async function readRegistry() {
  try {
    return JSON.parse(await readFile(REGISTRY_FILE, "utf8"));
  } catch {
    return { version: 1, updatedAt: "", tokens: {} };
  }
}

function createLicenseToken() {
  const payload = randomTokenText(8);
  return `MD-${payload.slice(0, 4)}-${payload.slice(4)}-${licenseChecksum(payload)}`;
}

function isLicenseTokenValid(token) {
  const value = normalizeLicenseToken(token);
  const match = value.match(/^MD-([A-HJ-NP-Z2-9]{4})-([A-HJ-NP-Z2-9]{4})-([A-HJ-NP-Z2-9]{4})$/);
  if (!match) return false;

  const payload = `${match[1]}${match[2]}`;
  return match[3] === licenseChecksum(payload);
}

function formatLicenseToken(value) {
  const raw = normalizeLicenseToken(value).replace(/[^A-Z0-9]/g, "");
  const body = (raw.startsWith("MD") ? raw.slice(2) : raw).slice(0, 12);
  const chunks = body.match(/.{1,4}/g) || [];

  if (!body) return raw.startsWith("MD") ? "MD-" : "";
  return ["MD", ...chunks].join("-");
}

function normalizeLicenseToken(value) {
  return String(value || "").trim().toUpperCase();
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

async function registryLookupKey(token) {
  return bytesToBase64Url(await digestBytes(`lookup:${LICENSE_REGISTRY_SECRET}:${normalizeLicenseToken(token)}`));
}

async function encryptRegistryPayload(token, payload) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await registryCryptoKey(token);
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );

  return {
    iv: bytesToBase64Url(iv),
    data: bytesToBase64Url(new Uint8Array(data)),
    createdAt: payload.createdAt
  };
}

async function registryCryptoKey(token) {
  const raw = await digestBytes(`key:${LICENSE_REGISTRY_SECRET}:${normalizeLicenseToken(token)}`);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function digestBytes(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

function bytesToBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
