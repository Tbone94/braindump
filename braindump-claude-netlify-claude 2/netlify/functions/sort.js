const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const MAX_DUMP_CHARS = 4000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTime(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

function cleanString(value, max = 240) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = ['event', 'todo', 'note'].includes(raw.type) ? raw.type : 'note';
  const title = cleanString(raw.title || raw.summary || raw.text || '', 120);
  if (!title) return null;

  const item = { type, title };

  if (type === 'event') {
    if (isDate(raw.date)) item.date = raw.date;
    if (isTime(raw.time)) item.time = raw.time;
    const location = cleanString(raw.location, 180);
    if (location) item.location = location;
    item.flags = Array.isArray(raw.flags) ? raw.flags.slice(0, 2) : [];
  }

  if (type === 'todo') {
    if (isDate(raw.due)) item.due = raw.due;
    if (!item.due && isDate(raw.date)) item.due = raw.date;
    const notes = cleanString(raw.notes || raw.location, 220);
    if (notes) item.notes = notes;
    item.done = false;
    item.flags = Array.isArray(raw.flags) ? raw.flags.slice(0, 2) : [];
  }

  if (type === 'note') {
    const summary = cleanString(raw.summary || raw.notes || '', 500);
    if (summary) item.summary = summary;
    if (Array.isArray(raw.points)) {
      item.points = raw.points.map((p) => cleanString(p, 160)).filter(Boolean).slice(0, 6);
    }
    if (Array.isArray(raw.tags)) {
      item.tags = raw.tags.map((t) => cleanString(t, 24).replace(/^#/, '')).filter(Boolean).slice(0, 4);
    }
  }

  return item;
}

function extractJson(text) {
  if (!text || typeof text !== 'string') throw new Error('empty model text');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('no json object');
  return JSON.parse(candidate.slice(start, end + 1));
}

function buildSystemPrompt() {
  return `You are the private sorting engine for a small app called Braindump.
The user writes messy reminders, notes, ideas, dates, and errands.
Return ONLY valid JSON. No markdown. No explanation.

Goal: split the dump into small useful items and classify each as:
- event: calendar/schedule item with a date or time
- todo: action/task/reminder
- note: idea, thought, general note, project detail, or anything uncertain

Rules:
- Today is provided by the app as YYYY-MM-DD. Use it for relative dates.
- Dates must be YYYY-MM-DD.
- Times must be 24-hour HH:MM.
- If a phrase is ambiguous, make a reasonable best guess and add a short flags array.
- If no date is clear for a task, omit due.
- If no date is clear for an event, classify as note unless the user clearly means a scheduled thing.
- Preserve useful names, places, and context.
- Use shorthand presets as location/detail hints when they match the dump.
- Keep titles short and human.

Required JSON shape:
{"items":[{"type":"event|todo|note","title":"...","date":"YYYY-MM-DD","time":"HH:MM","due":"YYYY-MM-DD","location":"...","notes":"...","summary":"...","points":["..."],"tags":["..."],"flags":[]}]}`;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return json(503, { error: 'Missing ANTHROPIC_API_KEY. Offline parser will handle this.' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (_) {
    return json(400, { error: 'Invalid JSON body' });
  }

  const dump = cleanString(payload.dump, MAX_DUMP_CHARS);
  const today = isDate(payload.today) ? payload.today : new Date().toISOString().slice(0, 10);
  const presets = Array.isArray(payload.presets) ? payload.presets.slice(0, 25).map((p) => ({
    name: cleanString(p.name, 60),
    detail: cleanString(p.detail, 160)
  })).filter((p) => p.name || p.detail) : [];

  if (!dump) return json(400, { error: 'Missing dump text' });

  const userPayload = {
    today,
    presets,
    dump
  };

  try {
    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        temperature: 0,
        system: buildSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: `Sort this Braindump payload into JSON:\n${JSON.stringify(userPayload)}`
          }
        ]
      })
    });

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text().catch(() => '');
      return json(502, { error: 'Claude request failed', status: anthropicRes.status, detail: detail.slice(0, 400) });
    }

    const data = await anthropicRes.json();
    const text = data?.content?.find?.((block) => block.type === 'text')?.text || data?.content?.[0]?.text;
    const parsed = extractJson(text);
    const items = Array.isArray(parsed.items) ? parsed.items.map(normalizeItem).filter(Boolean).slice(0, 25) : [];

    if (!items.length) return json(422, { error: 'Claude returned no valid items' });

    return json(200, { source: 'claude', model: MODEL, items });
  } catch (err) {
    return json(500, { error: 'Sort function error', detail: String(err.message || err).slice(0, 300) });
  }
};
