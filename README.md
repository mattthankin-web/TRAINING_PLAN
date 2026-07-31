# Cycling WhatsApp Coach

A self-hosted AI coach that texts you on WhatsApp. It reads your wellness and
training-load data from [intervals.icu](https://intervals.icu) (which is
already synced from Garmin and Oura), asks Claude to interpret it, and:

- **Answers questions** you text it ("how am I looking today?", "should I do
  the hard set tonight?").
- **Messages you first** every morning with a short train-hard / go-easy /
  rest verdict.

Runs as a single Cloudflare Worker — no server to maintain.

## Architecture

```
WhatsApp  <-->  Twilio  <-->  Cloudflare Worker  <-->  intervals.icu API
                                      |
                                      v
                                Claude API
```

- `src/twilio.ts` — validates incoming webhook signatures, sends replies.
- `src/intervals.ts` — pulls recent wellness/training-load data.
- `src/anthropic.ts` — calls Claude to turn data into advice.
- `src/coach.ts` — prompt building shared by chat replies and the daily nudge.
- `src/index.ts` — the Worker: HTTP webhook handler + cron trigger.

## Prerequisites (things only you can set up)

1. **Twilio account** with a phone number registered as a WhatsApp sender
   (Console → Messaging → Senders → WhatsApp → Self Sign-up). This also
   handles the Meta WhatsApp Business Account approval for you.
2. **A WhatsApp message template**, approved by Meta, for the daily proactive
   message (Twilio Console → Content Editor). Business-initiated messages
   outside a 24h reply window require an approved template — free-form chat
   replies to you don't. Create a template with one variable, e.g.:
   > 🚴 Coach check-in: {{1}}

   Approval usually takes 1-2 days. Note the **Content SID** (starts `HX...`).
3. **intervals.icu API key** — Settings → Developer Settings. Also note your
   athlete ID (the `iNNNNNN` in your intervals.icu URL).
4. **Anthropic API key** — console.anthropic.com.
5. **Cloudflare account** (free tier is enough) and the `wrangler` CLI
   logged in (`npx wrangler login`).

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in real values, this file is gitignored
npm run dev                      # runs the worker locally with a tunnel URL
```

## Deploy

```bash
npm run deploy
```

Then set the same secrets in production (never commit real secrets to
`wrangler.toml`):

```bash
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_WHATSAPP_FROM
npx wrangler secret put MY_WHATSAPP_NUMBER
npx wrangler secret put TWILIO_DAILY_TEMPLATE_SID
npx wrangler secret put INTERVALS_API_KEY
npx wrangler secret put INTERVALS_ATHLETE_ID
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ANTHROPIC_MODEL   # optional, defaults to claude-sonnet-5
```

## Wire up Twilio

In the Twilio Console, set your WhatsApp sender's **incoming message
webhook** to:

```
https://<your-worker-subdomain>.workers.dev/webhook/whatsapp
```

Method: `HTTP POST`. The exact URL must match what Twilio sends signature
validation against — double check for trailing slashes.

## Daily nudge schedule

Edit the cron in `wrangler.toml` (`crons = ["0 12 * * *"]`). Cron runs in
UTC, so convert your desired local morning time yourself, and remember it'll
drift an hour across daylight saving unless you nudge it twice a year.

## Test it

- Text your Twilio WhatsApp number a question from your own WhatsApp
  (must match `MY_WHATSAPP_NUMBER` exactly, including country code).
- To test the daily nudge without waiting for the cron: `npx wrangler dev
  --test-scheduled`, then hit `http://localhost:8787/__scheduled` — or just
  wait for tomorrow's run and check `npx wrangler tail` for logs.

## Costs

- Twilio: ~$1/month for the number, ~$0.005-0.01/message. At 1-2
  messages/day this is cents/month.
- Cloudflare Workers: free tier covers this easily.
- Claude API: a handful of short requests/day, effectively free at this
  volume.

## Security notes

- Every incoming webhook is checked against Twilio's HMAC signature before
  any processing happens.
- The bot only ever replies to `MY_WHATSAPP_NUMBER` — even if someone else
  texts your Twilio number, they get silence.
- Secrets are stored via `wrangler secret`, never in source or `wrangler.toml`.

## Ideas for later

- Pull recent activities (not just wellness) into the prompt for richer
  context (e.g. "you did 3 hard days in a row").
- Let it write structured workouts back to intervals.icu via its workouts
  API when you ask for one.
- Track a short conversation history so follow-up questions have context.
