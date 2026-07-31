import type { Env } from "./env";
import { validateTwilioSignature, sendTemplate } from "./twilio";
import { answerQuestion, draftDailyMessage } from "./coach";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function twiml(message?: string): Response {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(body, { headers: { "content-type": "text/xml" } });
}

async function handleIncoming(request: Request, env: Env): Promise<Response> {
  const bodyText = await request.text();
  const params = Object.fromEntries(new URLSearchParams(bodyText));
  const signature = request.headers.get("X-Twilio-Signature") || "";

  const valid = await validateTwilioSignature(env.TWILIO_AUTH_TOKEN, request.url, params, signature);
  if (!valid) {
    return new Response("Invalid signature", { status: 403 });
  }

  // Only ever respond to your own number, even if Twilio's number is somehow
  // reachable by someone else.
  if (params.From !== env.MY_WHATSAPP_NUMBER) {
    return twiml();
  }

  const question = params.Body?.trim();
  if (!question) {
    return twiml();
  }

  try {
    const answer = await answerQuestion(env, question);
    return twiml(answer);
  } catch (err) {
    console.error(err);
    return twiml("Something went wrong pulling your training data — check the worker logs.");
  }
}

async function sendDailyNudge(env: Env): Promise<void> {
  const message = await draftDailyMessage(env);
  await sendTemplate(env, env.MY_WHATSAPP_NUMBER, env.TWILIO_DAILY_TEMPLATE_SID, { "1": message });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/webhook/whatsapp" && request.method === "POST") {
      return handleIncoming(request, env);
    }
    return new Response("Not found", { status: 404 });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sendDailyNudge(env));
  },
};
