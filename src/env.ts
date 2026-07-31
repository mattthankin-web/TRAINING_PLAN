export interface Env {
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_WHATSAPP_FROM: string;
  MY_WHATSAPP_NUMBER: string;
  TWILIO_DAILY_TEMPLATE_SID: string;

  INTERVALS_API_KEY: string;
  INTERVALS_ATHLETE_ID: string;

  ANTHROPIC_API_KEY: string;
  ANTHROPIC_MODEL?: string;
}
