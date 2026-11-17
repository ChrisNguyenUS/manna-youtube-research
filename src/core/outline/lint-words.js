// Words the owner's "tính người" checklist (part 5) bans from a script, with what to say instead. Lower case;
// matched as whole words or phrases. Edit this list to change the check.

/** @type {{word: string, suggest: string}[]} */
export const BANNED = [
  { word: 'khoảng cách kỳ vọng', suggest: 'nói rõ người xem tưởng gì và thực tế là gì' },
  { word: 'hiệu ứng leo thang', suggest: 'kể từng bước cái gì tăng lên' },
  { word: 'tạo sự tò mò', suggest: 'nói rõ người xem tò mò về cái gì' },
  { word: 'đối lập', suggest: 'đặt hai thứ cạnh nhau và gọi tên từng thứ' },
  { word: 'đảo ngược kỳ vọng', suggest: 'nói người xem tưởng gì, hoá ra là gì' },
  { word: 'cấu trúc a vs b', suggest: 'gọi tên hai thứ đang so' },
  { word: 'hook kích nỗi sợ', suggest: 'nói người xem sợ cái gì' },
  { word: 'engagement', suggest: 'nói người xem làm gì: bình luận, lưu, chia sẻ' },
  { word: 'conversion', suggest: 'nói người xem mua gì, đăng ký gì' },
  { word: 'retention', suggest: 'người xem ở lại tới đâu' },
  { word: 'insight', suggest: 'mối quan tâm, điều người xem thực sự nghĩ' },
  { word: 'target audience', suggest: 'tệp người xem' },
  { word: 'emotional appeal', suggest: 'nói cảm xúc cụ thể' },
  { word: 'narrative arc', suggest: 'kể câu chuyện đi từ đâu tới đâu' },
  { word: 'tối ưu hoá', suggest: 'làm cho tốt hơn ở chỗ nào' },
  { word: 'tối ưu hóa', suggest: 'làm cho tốt hơn ở chỗ nào' },
  { word: 'tuy nhiên', suggest: 'Nhưng mà, Cơ mà, Thế nhưng' },
  { word: 'do đó', suggest: 'Thế nên, Nên là' },
  { word: 'mặc dù vậy', suggest: 'Dù vậy, Ấy vậy mà' },
  { word: 'điều đáng chú ý', suggest: 'Cái hay ở đây là' },
  { word: 'có thể kết luận rằng', suggest: 'Chốt lại thì, Nói chung là' },
  { word: 'thô mộc', suggest: 'mộc mạc' },
];

/** Words that usually ask the viewer to act. A hint, not a judgement. */
export const CTA_WORDS = ['theo dõi', 'follow', 'bình luận', 'comment', 'inbox', 'nhắn tin', 'để lại', 'lưu lại', 'chia sẻ', 'share', 'bấm', 'nhấn', 'link', 'tải', 'nhận', 'đăng ký', 'subscribe', 'xem tiếp', 'phần sau'];
