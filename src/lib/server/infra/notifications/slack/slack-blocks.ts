import { truncateText } from '../chat-format';
import type { ChannelMessage } from '../chat-notification';

const HEADER_MAX = 150;
const SECTION_TEXT_MAX = 3000;
const FIELD_TEXT_MAX = 2000;
const FIELDS_PER_SECTION = 10;
const MAX_FIELDS = 30;
const MAX_CHANGES = 15;
const BUTTON_TEXT_MAX = 75;
const URL_MAX = 3000;
const FALLBACK_TEXT_MAX = 3000;

type PlainText = { type: 'plain_text'; text: string; emoji?: boolean };
type Mrkdwn = { type: 'mrkdwn'; text: string };

export type SlackBlock =
  | { type: 'header'; text: PlainText }
  | { type: 'section'; text?: Mrkdwn; fields?: Mrkdwn[] }
  | { type: 'context'; elements: Mrkdwn[] }
  | { type: 'divider' }
  | {
      type: 'actions';
      elements: Array<{ type: 'button'; text: PlainText; url: string; action_id: string }>;
    };

export type SlackPayload = { text: string; blocks: SlackBlock[] };

export function escapeSlackText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(value: string): string {
  return escapeSlackText(value.replace(/\s*\n\s*/g, ' '));
}

function mrkdwn(text: string, max: number): Mrkdwn {
  return { type: 'mrkdwn', text: truncateText(text, max) };
}

export function slackDate(iso: string): string | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const fallback = new Date(time).toISOString().slice(0, 16).replace('T', ' ');
  return `<!date^${Math.floor(time / 1000)}^{date_short_pretty} {time}|${fallback} UTC>`;
}

const DEFAULT_LABELS = {
  date: 'Date',
  changes: 'Changes',
  before: 'Before',
  after: 'New',
  empty: 'empty',
};

function changeText(
  change: NonNullable<ChannelMessage['changes']>[number],
  labels: NonNullable<ChannelMessage['labels']>,
): string {
  const title = `*${inline(change.label)}*`;
  if (change.before === null && change.after === null) return title;
  const value = (text: string | null) =>
    text === null ? `_${inline(labels.empty)}_` : inline(text);
  return [
    title,
    `${inline(labels.before)}: ${value(change.before)}`,
    `${inline(labels.after)}: ${value(change.after)}`,
  ].join('\n');
}

export function buildSlackPayload(message: ChannelMessage): SlackPayload {
  const labels = message.labels ?? DEFAULT_LABELS;
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: truncateText(message.title, HEADER_MAX), emoji: false },
    },
  ];

  if (message.summary && message.summary !== message.eventLabel) {
    blocks.push({
      type: 'section',
      text: mrkdwn(`*${inline(message.summary)}*`, SECTION_TEXT_MAX),
    });
  }

  const date = message.occurredAt ? slackDate(message.occurredAt) : null;
  const whereAndWhen = [
    message.location
      ? mrkdwn(
          `*${inline(message.location.label)}*\n${inline(message.location.name)}`,
          FIELD_TEXT_MAX,
        )
      : null,
    date ? mrkdwn(`*${inline(labels.date)}*\n${date}`, FIELD_TEXT_MAX) : null,
  ].filter((field): field is Mrkdwn => field !== null);
  if (whereAndWhen.length > 0) blocks.push({ type: 'section', fields: whereAndWhen });

  const changes = message.changes ?? [];
  if (changes.length > 0) {
    blocks.push(
      { type: 'divider' },
      { type: 'section', text: mrkdwn(`*${inline(labels.changes)}*`, SECTION_TEXT_MAX) },
    );
  }
  for (const change of changes.slice(0, MAX_CHANGES)) {
    blocks.push({ type: 'section', text: mrkdwn(changeText(change, labels), SECTION_TEXT_MAX) });
  }
  if (changes.length > MAX_CHANGES) {
    blocks.push({
      type: 'context',
      elements: [mrkdwn(`+${changes.length - MAX_CHANGES}`, SECTION_TEXT_MAX)],
    });
  }

  const fields = message.fields.slice(0, MAX_FIELDS);
  for (let start = 0; start < fields.length; start += FIELDS_PER_SECTION) {
    blocks.push({
      type: 'section',
      fields: fields
        .slice(start, start + FIELDS_PER_SECTION)
        .map(({ label, value }) =>
          mrkdwn(`*${inline(label)}*\n${escapeSlackText(value)}`, FIELD_TEXT_MAX),
        ),
    });
  }

  if (message.link && message.link.url.length <= URL_MAX) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: truncateText(message.link.label, BUTTON_TEXT_MAX) },
          url: message.link.url,
          action_id: 'open_in_gitops',
        },
      ],
    });
  }

  if (message.note) {
    blocks.push({ type: 'context', elements: [mrkdwn(inline(message.note), SECTION_TEXT_MAX)] });
  }

  return { text: truncateText(escapeSlackText(message.text), FALLBACK_TEXT_MAX), blocks };
}
