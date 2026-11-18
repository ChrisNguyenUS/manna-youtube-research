// Insight khách hàng → Từ comment đã có, YouTube: the shared screen (web/views/insight-collected-view.js) on the
// YouTube comments the app already keeps. New runs of any of these show up here on their own.
import { mountCollected } from './insight-collected-view.js';
import { youtubeCommentData } from '../http/client.js';

/** @param {Element} root */
export const mount = (root) =>
  mountCollected(root, {
    platform: 'youtube',
    formKey: 'yt-insight-collected',
    intro: 'Gộp bình luận YouTube đã có ở Bình luận → Lấy comment, Phân tích video, Insight YouTube và Nghiên cứu chủ đề (Đọc comment). Không lấy thêm từ YouTube. Bấm vào nhóm nào cũng ra đúng các comment gốc.',
    emptyHint: ' Dùng Bình luận → Lấy comment, Phân tích video hoặc Insight YouTube trước.',
    kinds: { comments: 'Lấy comment', video_analysis: 'Phân tích video', youtube_insight: 'Insight', research: 'Nghiên cứu chủ đề' },
    data: youtubeCommentData,
  });
