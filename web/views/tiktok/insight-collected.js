// Insight khách hàng → Từ comment đã có, TikTok: the shared screen (web/views/insight-collected-view.js) on the
// TikTok comment dataset (Thu thập bình luận, Phân tích video, Insight runs).
import { mountCollected } from '../insight-collected-view.js';
import { tiktokCommentData } from '../../http/client.js';

/** @param {Element} root */
export const mount = (root) =>
  mountCollected(root, {
    platform: 'tiktok',
    formKey: 'tt-insight-collected',
    intro: 'Gộp bình luận đã thu thập ở Thu thập bình luận, Phân tích video và các lần Insight trước. Không lấy thêm từ TikTok. Bấm vào nhóm nào cũng ra đúng các comment gốc.',
    emptyHint: ' Dùng Thu thập bình luận hoặc Phân tích video trước.',
    kinds: { tiktok_comments: 'Thu thập', tiktok_video_analysis: 'Phân tích video', tiktok_insight: 'Insight' },
    data: tiktokCommentData,
  });
