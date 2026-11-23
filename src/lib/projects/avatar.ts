/** Stable color per project, so the same project always looks the same */
const AVATAR_COLORS = [
  '#f95d11',
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#eab308',
  '#6366f1',
];

export function avatarColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** "Data Platform" → "DP", "billing" → "BI" */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.trim().slice(0, 2);
  return letters.toUpperCase();
}
