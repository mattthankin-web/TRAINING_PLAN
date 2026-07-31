import type { Env } from "./env";
import { getWellness, type WellnessEntry } from "./intervals";
import { ask } from "./anthropic";

const SYSTEM_PROMPT = `You are a direct, knowledgeable cycling coach texting your athlete over
WhatsApp. You're given their recent HRV, resting heart rate, sleep, and
training load (CTL = fitness, ATL = fatigue, ramp rate = how fast load is
rising) from intervals.icu. Give specific, concise advice grounded in the
numbers — no generic platitudes, no disclaimers, no "consult a doctor."
Keep replies short enough for a text message.`;

function formatContext(entries: WellnessEntry[]): string {
  if (entries.length === 0) return "No recent wellness data available.";
  return entries
    .slice(-10)
    .map((e) => {
      const sleep = e.sleepSecs ? `${(e.sleepSecs / 3600).toFixed(1)}h sleep` : "no sleep data";
      const hrv = e.hrv != null ? `HRV ${e.hrv}` : "no HRV";
      const rhr = e.restingHR != null ? `RHR ${e.restingHR}` : "no RHR";
      const load = e.ctl != null && e.atl != null ? `CTL ${e.ctl.toFixed(0)}/ATL ${e.atl.toFixed(0)}` : "no load data";
      return `${e.id}: ${sleep}, ${hrv}, ${rhr}, ${load}`;
    })
    .join("\n");
}

export async function answerQuestion(env: Env, question: string): Promise<string> {
  const wellness = await getWellness(env, 14);
  const context = formatContext(wellness);
  return ask(
    env,
    SYSTEM_PROMPT,
    `Recent data (most recent last):\n${context}\n\nAthlete's message: ${question}`
  );
}

export async function draftDailyMessage(env: Env): Promise<string> {
  const wellness = await getWellness(env, 14);
  const context = formatContext(wellness);
  return ask(
    env,
    SYSTEM_PROMPT,
    `Recent data (most recent last):\n${context}\n\n` +
      `Write today's check-in: 2-4 sentences telling the athlete whether to ` +
      `train hard, go easy, or rest today, and the specific reason from the data.`
  );
}
