import { test } from "node:test";
import assert from "node:assert/strict";

process.env.TOKEN_ENCRYPTION_KEY = "11".repeat(32);
const { decrypt, encrypt, secretMatches, signState, verifyState } = await import("../src/crypto.js");

test("encrypt/decrypt round-trips and never stores plaintext", () => {
  const token = "_0XBPWQQ_secret-access-token";
  const enc = encrypt(token);
  assert.notEqual(enc, token);
  assert.ok(!enc.includes("secret"));
  assert.equal(decrypt(enc), token);
});

test("tampered ciphertext is rejected", () => {
  const enc = Buffer.from(encrypt("abc"), "base64");
  enc[enc.length - 1] ^= 1;
  assert.throws(() => decrypt(enc.toString("base64")));
});

test("OAuth state verifies only when signed and unexpired", () => {
  assert.equal(verifyState(signState()), true);
  assert.equal(verifyState(signState(-1)), false);
  const s = signState();
  assert.equal(verifyState(s.slice(0, -1) + (s.endsWith("0") ? "1" : "0")), false);
  assert.equal(verifyState(undefined), false);
  assert.equal(verifyState("garbage"), false);
});

test("secretMatches is exact", () => {
  assert.equal(secretMatches("abc", "abc"), true);
  assert.equal(secretMatches("abcd", "abc"), false);
  assert.equal(secretMatches(undefined, "abc"), false);
});
