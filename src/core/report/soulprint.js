// Markdown of the Soulprint profile: what is filled, in the order of the screen. Empty sections are left out.
import { GAME_LABELS, readiness } from '../soulprint/profile.js';

const STRENGTH = { strong: 'mạnh', possible: 'có thể', no: 'chưa' };

/** @param {ReturnType<typeof import('../soulprint/profile.js').emptyProfile>} p */
export function soulprintMarkdown(p) {
  const r = readiness(p);
  const missing = r.checks.filter((c) => !c.ok).map((c) => c.label);
  const out = ['# Soulprint', '', `Hồ sơ đủ dùng: ${r.done}/${r.total}.${missing.length ? ` Còn thiếu: ${missing.join(', ')}.` : ''}`];
  const sec = (title, ...blocks) => {
    const body = blocks.filter(Boolean);
    if (body.length) out.push('', `## ${title}`, '', body.join('\n\n'));
  };
  const list = (label, items) => (items.length ? `${label}:\n${items.map((x) => `- ${x}`).join('\n')}` : '');
  sec('Kênh đang có', p.channels.map((c) => `- ${[c.handle, c.url].filter(Boolean).join(' · ')}`).join('\n'), p.startingFromZero ? 'Bắt đầu từ số 0.' : '');
  const b = p.business;
  sec('Việc kinh doanh', b.offer && `Bán: ${b.offer}`, b.price && `Giá: ${b.price}`, b.buyer && `Ai trả tiền: ${b.buyer}`, b.howBought && `Mua bằng cách: ${b.howBought}`,
    b.viewerIsBuyer == null ? '' : `Người xem ${b.viewerIsBuyer ? 'cũng là' : 'không phải'} người trả tiền.`, b.note);
  sec('Game', p.game && GAME_LABELS[p.game], p.objective && `Mục tiêu 12–18 tháng: ${p.objective}`, p.gameReason && `Vì sao: ${p.gameReason}`);
  const a = p.avatar;
  sec('Avatar', (a.name || a.tag) && `**${[a.name, a.tag && `(${a.tag})`].filter(Boolean).join(' ')}**`, a.portrait, list('Tin', a.believes), list('Sợ', a.fears), list('Đã thử', a.tried), list('Hay than', a.complains));
  sec('Kết quả mơ tới', p.dreamOutcome);
  sec('Kho nỗi đau', p.pains.map((x, i) => `${i + 1}. ${x.text} (${x.type === 'broad' ? 'lớn' : 'nhỏ'}, độ đau ${x.pain}/5)`).join('\n'));
  sec('Lợi thế riêng', p.advantage);
  sec('Điều duy nhất', p.oneThing);
  sec('Câu định vị', p.statement.chosen && `**${p.statement.chosen}**`, list('Dạng khác', p.statement.alternates), p.statement.why);
  sec('Câu lọc', p.filter);
  sec('Pillars', p.pillars.map((x) => [`### ${x.name}`, x.belief && `Niềm tin đi ngược: ${x.belief}`, list('Bằng chứng', x.proof), x.subtopics.length ? `Chủ đề con (${x.subtopics.length}): ${x.subtopics.join(', ')}` : ''].filter(Boolean).join('\n\n')).join('\n\n'));
  const rated = p.hypothesis.attributes.filter((x) => x.strength);
  sec('Giả thuyết định vị', rated.length || p.hypothesis.lane ? 'Giả thuyết từ hiểu biết của chính chủ kênh, chưa đối chiếu với đối thủ.' : '',
    rated.map((x) => `- ${x.name}: ${STRENGTH[x.strength]}${x.evidence ? `. ${x.evidence}` : ''}`).join('\n'), p.hypothesis.lane);
  sec('Giọng nói', p.voice);
  return out.join('\n') + '\n';
}
