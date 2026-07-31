import type { Env } from "./env";

// Twilio signs each webhook request with HMAC-SHA1 over the exact request URL
// plus every POST param (sorted by key, concatenated as key+value with no
// separator), keyed with your Auth Token. See:
// https://www.twilio.com/docs/usage/security#validating-requests
export async function validateTwilioSignature(
  authToken: string,
  requestUrl: string,
  params: Record<string, string>,
  signature: string
): Promise<boolean> {
  if (!signature) return false;

  let data = requestUrl;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return computed === signature;
}

async function sendMessage(env: Env, params: Record<string, string>): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = "Basic " + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: auth,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });

  if (!res.ok) {
    throw new Error(`Twilio send failed: ${res.status} ${await res.text()}`);
  }
}

// Freeform reply — only valid while inside a 24h customer-service window
// (i.e. replying to a message you just received). Used for chat answers.
export function sendFreeform(env: Env, to: string, body: string): Promise<void> {
  return sendMessage(env, { To: to, From: env.TWILIO_WHATSAPP_FROM, Body: body });
}

// Business-initiated message — requires a pre-approved Content Template.
// Used for the daily proactive nudge.
export function sendTemplate(
  env: Env,
  to: string,
  contentSid: string,
  contentVariables: Record<string, string>
): Promise<void> {
  return sendMessage(env, {
    To: to,
    From: env.TWILIO_WHATSAPP_FROM,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(contentVariables),
  });
}
