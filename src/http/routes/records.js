// Saved results: list, read (always upgraded to the latest shape), delete, export.
import { httpError, raw } from '../router.js';
import { metricLabel } from '../../core/metrics/definitions.js';
import { researchMarkdown, channelMarkdown, commentsMarkdown } from '../../core/report/markdown.js';
import { toCsv } from '../../core/report/csv.js';
import { tiktokInsightMarkdown, tiktokCommentsMarkdown, tiktokTopicMarkdown, tiktokTopicSheets } from '../../core/report/tiktok.js';
import { toXlsx } from '../../core/report/xlsx.js';
import { videoAnalysisMarkdown, VIDEO_ANALYSIS_COLS } from '../../core/report/video-analysis.js';
import { classifyComment } from '../../core/analysis/text.js';
import { foldWords } from '../../core/tiktok/keywords.js';

const groupOf = (c) => ['question', 'fear', 'complaint', 'buying', 'request'].filter((k) => c[k]).join('; ');
const TIKTOK_COMMENT_COLS = [
  { key: 'text', label: 'Comment' }, { key: 'likes', label: 'Like' }, { key: 'replies', label: 'Trả lời' },
  { key: 'attentionPerDay', label: 'Attention/ngày' }, { label: 'Là trả lời', get: (c) => (c.isReply ? 'Có' : '') },
  { label: 'Nhóm', get: groupOf }, { key: 'videoId', label: 'Video' }, { label: 'Link video', get: (c) => (c.videoId ? `https://www.tiktok.com/video/${c.videoId}` : '') },
];
const TIKTOK_VIDEO_COLS = [
  { key: 'caption', label: 'Caption' }, { key: 'url', label: 'Link' }, { key: 'author', label: 'Creator' }, { key: 'plays', label: 'View' },
  { key: 'likes', label: 'Like' }, { key: 'comments', label: 'Comment' }, { key: 'shares', label: 'Share' }, { key: 'saves', label: 'Save' },
  { key: 'hotScore', label: metricLabel('hotScore') }, { key: 'engagementRate', label: metricLabel('engagementRate') }, { key: 'ageDays', label: 'Tuổi (ngày)' },
  { label: 'Đúng chủ đề', get: (v) => (v.onTopic ? 'Có' : '') }, { label: 'Từ khoá', get: (v) => (v.queries || []).join('; ') },
];

const attachment = (name) => ({ 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` });
const slug = (s) => String(s || 'export').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 50) || 'export';
const stamp = () => new Date().toISOString().slice(0, 10);

const VIDEO_COLS = [
  { key: 'title', label: 'Tiêu đề' },
  { key: 'url', label: 'Link' },
  { key: 'channelTitle', label: 'Kênh' },
  { key: 'channelSubs', label: 'Sub kênh' },
  { key: 'views', label: 'View' },
  { key: 'outlierScore', label: metricLabel('outlierScore') },
  { key: 'channelMedianViews', label: metricLabel('channelMedianViews') },
  { key: 'viewSub', label: metricLabel('viewSub') },
  { key: 'vph', label: metricLabel('vph') },
  { key: 'viewsPerDay', label: metricLabel('viewsPerDay') },
  { key: 'likes', label: 'Like' },
  { key: 'durationSec', label: 'Dài (giây)' },
  { key: 'age', label: 'Tuổi (ngày)' },
  { key: 'publishedAt', label: 'Ngày đăng' },
  { key: 'published', label: 'Đăng (YouTube ghi)' },
  { label: 'Từ khoá', get: (v) => (v.queries || []).join('; ') },
];
const CHANNEL_COLS = [
  { key: 'title', label: 'Kênh' },
  { key: 'handle', label: 'Handle' },
  { key: 'url', label: 'Link' },
  { key: 'subs', label: 'Sub' },
  { key: 'videoCount', label: 'Số video' },
  { key: 'totalViews', label: 'Tổng view' },
  { key: 'medianViews', label: 'View trung vị 30 video' },
  { key: 'viewSubRatio', label: 'View trung vị / sub' },
  { key: 'views7d', label: 'View video đăng 7 ngày' },
  { key: 'views30d', label: 'View video đăng 30 ngày' },
  { key: 'uploadsPerWeek', label: 'Video/tuần' },
  { key: 'lastUploadDays', label: 'Đăng gần nhất (ngày)' },
  { key: 'country', label: 'Quốc gia' },
  { key: 'joined', label: 'Ngày tạo kênh' },
];
const COMMENT_COLS = [
  { key: 'text', label: 'Comment' },
  { key: 'likes', label: 'Like' },
  { key: 'replies', label: 'Trả lời' },
  { key: 'published', label: 'Đăng' },
  { label: 'Là trả lời', get: (c) => (c.isReply ? 'Có' : '') },
  { label: 'Câu hỏi', get: (c) => (c.question ? 'Có' : '') },
  { key: 'videoTitle', label: 'Video' },
];


/** @param {any} ctx */
function exportRecord({ app, ws, params, query }) {
    const r = app.store.records.get(ws, Number(params.id));
    if (!r) throw httpError('not_found', 'Không thấy báo cáo');
    const name = `${slug(r.title)}-${stamp()}`;
    const what = query.get('what');
    const isVideoAnalysis = r.kind === 'tiktok_video_analysis' || r.kind === 'video_analysis';
    if (isVideoAnalysis && params.ext === 'md') {
      const raw1 = query.get('video');
      const only = raw1 == null ? undefined : Number(raw1);
      if (only !== undefined && !(Number.isInteger(only) && only >= 1 && only <= r.data.videos.length)) throw httpError('invalid_input', `phải là số từ 1 đến ${r.data.videos.length}`, 'video');
      const md = videoAnalysisMarkdown(r.data, { only });
      return query.get('inline') ? raw(md, 'text/markdown; charset=utf-8') : raw(md, 'text/markdown; charset=utf-8', attachment(`${name}${only ? `-video-${only}` : ''}.md`));
    }
    if (params.ext === 'md') {
      const md = r.kind === 'research' ? researchMarkdown(r.data) : r.kind === 'channel_analysis' ? channelMarkdown(r.data) : r.kind === 'comments' ? commentsMarkdown(r.data) : r.kind === 'tiktok_insight' ? tiktokInsightMarkdown(r.data) : r.kind === 'tiktok_comments' ? tiktokCommentsMarkdown(r.data) : r.kind === 'tiktok_topic' ? tiktokTopicMarkdown(r.data) : '```json\n' + JSON.stringify(r.data, null, 2) + '\n```\n';
      return query.get('inline') ? raw(md, 'text/markdown; charset=utf-8') : raw(md, 'text/markdown; charset=utf-8', attachment(`${name}.md`));
    }
    if (params.ext === 'xlsx') {
      if (r.kind !== 'tiktok_topic') throw httpError('invalid_input', 'Chỉ có file Excel cho Tìm theo chủ đề', 'ext');
      return raw(Buffer.from(toXlsx(tiktokTopicSheets(r.data))), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', attachment(`${name}.xlsx`));
    }
    let csv;
    if (r.kind === 'tiktok_topic') csv = toCsv(r.data.columns.flatMap((c) => c.videos.map((v) => ({ ...v, keyword: c.keyword }))), [
      { key: 'keyword', label: 'Từ khoá' }, { key: 'rank', label: 'Hạng' }, ...TIKTOK_VIDEO_COLS.slice(0, 8), { key: 'ageDays', label: 'Tuổi (ngày)' }, { key: 'playsPerDay', label: 'View/ngày' },
      { label: 'Tăng view', get: (v) => v.gain ?? '' }, { label: 'Top 3 comment', get: (v) => (v.topComments ?? []).map((c) => `${c.text} (${c.likes} tym)`).join(' | ') },
    ]);
    else if (r.kind === 'channel_search') csv = toCsv(r.data.channels, CHANNEL_COLS);
    else if (r.kind === 'comments') csv = toCsv(r.data.comments.map((c) => ({ ...c, videoTitle: r.data.video.title })), COMMENT_COLS);
    else if (r.kind === 'research' && what === 'comments') csv = toCsv([...(r.data.comments?.insights.top || [])], COMMENT_COLS);
    else if (r.kind === 'idea_check' && r.data.results[0]?.stats) csv = toCsv(r.data.results.filter((x) => !x.error), [
      { key: 'keyword', label: 'Từ khoá' }, { key: 'overall', label: 'Điểm tổng' }, { key: 'volume', label: 'Volume' }, { key: 'competition', label: 'Competition' },
      { label: 'View cao nhất', get: (x) => x.stats.highestViews }, { label: 'View TB', get: (x) => Math.round(x.stats.avgViews ?? 0) }, { label: 'Sub TB', get: (x) => Math.round(x.stats.avgSubs ?? 0) },
      { label: 'Mới 7 ngày', get: (x) => `${x.stats.added7d}/${x.stats.results}` }, { label: 'CC', get: (x) => `${x.stats.ccCount ?? '–'}/${x.stats.results}` }, { label: 'Tuổi TB (ngày)', get: (x) => Math.round(x.stats.avgAgeDays ?? 0) },
    ]);
    else if (r.kind === 'keywords') csv = toCsv(r.data.list, [{ key: 'keyword', label: 'Từ khoá' }, { key: 'hits', label: 'Số lần xuất hiện' }, { key: 'bestRank', label: 'Thứ hạng' }]);
    else if (r.kind === 'tiktok_search') csv = toCsv(r.data.videos, TIKTOK_VIDEO_COLS);
    else if (r.kind === 'tiktok_insight' || r.kind === 'tiktok_comments') csv = toCsv(r.data.comments.map((c) => ({ ...c, ...classifyComment(c.text), videoId: c.videoId ?? r.data.video?.id })), TIKTOK_COMMENT_COLS);
    else if (isVideoAnalysis) csv = toCsv(r.data.videos, VIDEO_ANALYSIS_COLS);
    else csv = toCsv(r.data.videos || [], VIDEO_COLS);
    return raw(csv, 'text/csv; charset=utf-8', attachment(`${name}.csv`));
}

export const recordRoutes = [
  { method: 'GET', path: '/api/v1/records', handler: ({ app, ws, query }) => app.store.records.list(ws, query.get('kind'), Number(query.get('limit')) || 50) },
  {
    // History page: every result, filtered by kinds (comma separated) and by words of the title (accents and case ignored), paged.
    method: 'GET', path: '/api/v1/records/search',
    handler: ({ app, ws, query }) => {
      const kinds = (query.get('kinds') || '').split(',').filter(Boolean);
      const words = foldWords(query.get('q') || '').split(' ').filter(Boolean);
      const limit = Math.min(Math.max(Number(query.get('limit')) || 50, 1), 200);
      const offset = Math.max(Number(query.get('offset')) || 0, 0);
      const rows = app.store.records.index(ws);
      const counts = {};
      for (const r of rows) counts[r.kind] = (counts[r.kind] || 0) + 1;
      const hits = rows.filter((r) => {
        if (kinds.length && !kinds.includes(r.kind)) return false;
        if (!words.length) return true;
        const title = ` ${foldWords(r.title)}`;
        return words.every((w) => title.includes(` ${w}`)); // each word starts a word of the title
      });
      return { total: hits.length, items: hits.slice(offset, offset + limit), counts };
    },
  },
  {
    method: 'GET', path: '/api/v1/records/:id',
    handler: ({ app, ws, params }) => {
      const r = app.store.records.get(ws, Number(params.id));
      if (!r) throw httpError('not_found', 'Không thấy báo cáo');
      return r;
    },
  },
  { method: 'DELETE', path: '/api/v1/records/:id', handler: ({ app, ws, params }) => (app.store.records.remove(ws, Number(params.id)), { ok: true }) },
  { method: 'GET', path: '/api/v1/records/:id/export.:ext', handler: exportRecord },
  { method: 'POST', path: '/api/v1/compare', handler: ({ app, body }) => app.features.compareChannels(Array.isArray(body.ids) ? body.ids : []) },
];
