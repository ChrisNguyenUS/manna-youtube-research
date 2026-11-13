// Markdown of the saved items ("Đã lưu"), to paste into a script, an ad brief or a Claude skill.
// Customer comments are quoted word for word and never carry the commenter's name.

const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const n = (x) => (x == null ? '–' : Math.round(Number(x)).toLocaleString('vi-VN'));
const note = (s) => (s.note ? `\n   - Ghi chú: ${one(s.note)}` : '');

/** Section title and one line per item, by saved kind. Order here is the order in the file. */
export const SAVED_KINDS = {
  quote: {
    title: 'Câu chữ của khách',
    line: (s) => `"${one(s.data.text)}" (♥ ${n(s.data.likes ?? 0)}, ${n(s.data.replies ?? 0)} trả lời)${s.data.topics?.length ? ` · nhóm: ${s.data.topics.join(', ')}` : ''}${s.data.source ? ` · chủ đề: ${one(s.data.source)}` : ''}${s.data.videoUrl ? ` · [video](${s.data.videoUrl})` : ''}`,
  },
  tiktok_video: {
    title: 'Video TikTok',
    line: (s) => `[${one(s.data.caption).slice(0, 120) || '(không caption)'}](${s.data.url}) · @${one(s.data.author)} · ${n(s.data.plays)} view · ${n(s.data.likes)} tim · ${n(s.data.comments)} bình luận${s.data.keywords?.length ? ` · từ khoá: ${s.data.keywords.join(', ')}` : ''}`,
  },
  keyword: {
    title: 'Từ khoá',
    line: (s) => `${one(s.data.keyword)} · ${s.data.platform === 'tiktok' ? 'TikTok' : 'YouTube'}${s.data.topic ? ` · chủ đề: ${one(s.data.topic)}` : ''}`,
  },
  video: {
    title: 'Video YouTube',
    line: (s) => `[${one(s.data.title)}](https://www.youtube.com/watch?v=${s.data.id}) · ${one(s.data.channelTitle)} · ${n(s.data.views)} view`,
  },
  channel: {
    title: 'Kênh YouTube',
    line: (s) => `[${one(s.data.title || s.title)}](https://www.youtube.com/${s.data.handle || `channel/${s.data.id}`}) · ${n(s.data.subs)} sub · view trung vị ${n(s.data.medianViews)}`,
  },
};

/**
 * @param {{kind: string, title?: string, note?: string, data: any}[]} items
 * @param {{date?: string}} [o]
 */
export function savedMarkdown(items, { date = new Date().toISOString().slice(0, 10) } = {}) {
  const L = [`# Đã lưu — ${date}`, ''];
  for (const [kind, def] of Object.entries(SAVED_KINDS)) {
    const list = items.filter((s) => s.kind === kind);
    if (!list.length) continue;
    L.push(`## ${def.title} (${list.length})`, '');
    for (const [i, s] of list.entries()) L.push(`${i + 1}. ${def.line({ ...s, data: s.data ?? {} })}${note(s)}`);
    L.push('');
  }
  if (L.length === 2) L.push('Chưa lưu gì.', '');
  return L.join('\n');
}
