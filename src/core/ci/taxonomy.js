// Customer Intelligence vocabulary (master prompt §D, PRD §4): labels, states, types, score weights. Pure.

export const PROMPT_VERSION = 'ci-1.0';
export const SCHEMA_VERSION = '1.0';

export const LABEL_DIMS = /** @type {const} */ ({
  intent: ['question', 'information_seeking', 'comparison', 'recommendation_request', 'service_request', 'complaint', 'testimonial', 'discussion', 'other', 'unknown'],
  pain: ['uncertainty', 'delay', 'complexity', 'cost', 'eligibility', 'documentation', 'trust', 'access', 'outcome_risk', 'process_confusion', 'other', 'unknown'],
  emotion: ['anxiety', 'frustration', 'hope', 'anger', 'relief', 'excitement', 'neutral', 'unknown'],
  objection: ['price', 'trust', 'proof', 'timing', 'eligibility', 'effort', 'risk', 'no_objection', 'unknown'],
  buying_signal: ['asks_price', 'asks_service', 'asks_consultation', 'asks_next_step', 'explicit_purchase', 'none', 'unknown'],
  experience: ['first_hand', 'second_hand', 'hearsay', 'hypothetical', 'unclear'],
});
export const DIM_KEYS = /** @type {(keyof typeof LABEL_DIMS)[]} */ (Object.keys(LABEL_DIMS));

/** Vietnamese names shown in the app. */
export const LABEL_VI = {
  intent: { question: 'Câu hỏi', information_seeking: 'Tìm thông tin', comparison: 'So sánh', recommendation_request: 'Xin gợi ý', service_request: 'Hỏi dịch vụ', complaint: 'Phàn nàn', testimonial: 'Kể trải nghiệm', discussion: 'Thảo luận', other: 'Khác', unknown: 'Chưa rõ' },
  pain: { uncertainty: 'Không chắc chắn', delay: 'Chậm trễ', complexity: 'Phức tạp', cost: 'Chi phí', eligibility: 'Điều kiện', documentation: 'Giấy tờ', trust: 'Niềm tin', access: 'Tiếp cận', outcome_risk: 'Sợ rủi ro kết quả', process_confusion: 'Rối quy trình', other: 'Khác', unknown: 'Chưa rõ' },
  emotion: { anxiety: 'Lo lắng', frustration: 'Bực bội', hope: 'Hy vọng', anger: 'Tức giận', relief: 'Nhẹ nhõm', excitement: 'Hào hứng', neutral: 'Trung tính', unknown: 'Chưa rõ' },
  objection: { price: 'Giá', trust: 'Niềm tin', proof: 'Bằng chứng', timing: 'Thời điểm', eligibility: 'Điều kiện', effort: 'Công sức', risk: 'Rủi ro', no_objection: 'Không có', unknown: 'Chưa rõ' },
  buying_signal: { asks_price: 'Hỏi giá', asks_service: 'Hỏi dịch vụ', asks_consultation: 'Xin tư vấn', asks_next_step: 'Hỏi bước tiếp', explicit_purchase: 'Muốn mua', none: 'Không có', unknown: 'Chưa rõ' },
  experience: { first_hand: 'Tự trải qua', second_hand: 'Người quen kể', hearsay: 'Nghe nói', hypothetical: 'Giả định', unclear: 'Không rõ' },
};
export const DIM_VI = { intent: 'Ý định', pain: 'Nỗi đau', emotion: 'Cảm xúc', objection: 'Rào cản', buying_signal: 'Tín hiệu mua', experience: 'Trải nghiệm' };

export const EPISTEMIC = /** @type {const} */ (['observed', 'supported', 'hypothesis', 'unverified', 'contradicted', 'rejected']);
export const EPISTEMIC_VI = { observed: 'Quan sát', supported: 'Có bằng chứng', hypothesis: 'Giả thuyết', unverified: 'Chưa kiểm chứng', contradicted: 'Có mâu thuẫn', rejected: 'Đã bác bỏ', needs_input: 'Cần thêm dữ liệu' };
export const INSIGHT_STATES = /** @type {const} */ (['draft', 'needs_evidence', 'ready_for_analysis', 'validated_by_user', 'rejected']);
export const INSIGHT_STATE_VI = { draft: 'Nháp AI', needs_evidence: 'Thiếu bằng chứng', ready_for_analysis: 'Sẵn sàng đào sâu', validated_by_user: 'Đã xác nhận', rejected: 'Đã bác bỏ' };
export const VALIDATION_DECISIONS = ['ready_for_analysis', 'needs_evidence', 'revise', 'rejected'];
export const STOP_DECISIONS = ['continue', 'branch', 'stop_evidence_insufficient', 'stop_actionable', 'stop_redundant', 'stop_conflict'];
export const STOP_VI = { continue: 'Đào tiếp', branch: 'Mở nhánh', stop_evidence_insufficient: 'Dừng: thiếu bằng chứng', stop_actionable: 'Dừng: đã đủ để làm nội dung', stop_redundant: 'Dừng: bắt đầu lặp', stop_conflict: 'Dừng: có mâu thuẫn' };
export const NODE_STATUSES = ['pending', 'accepted', 'edited', 'rejected'];
export const BRIEF_FIELD_STATUSES = ['supported', 'hypothesis', 'needs_input', 'observed'];
export const OBJECTIVES = ['educate', 'clarify', 'reassure', 'compare', 'qualify', 'convert'];
export const OPPORTUNITY_TYPES = ['education', 'FAQ', 'myth_clarification', 'objection_handling', 'comparison', 'process_walkthrough', 'case_study', 'trust_building', 'checklist', 'story', 'conversion'];
export const OPPORTUNITY_TYPE_VI = { education: 'Giáo dục', FAQ: 'Hỏi đáp', myth_clarification: 'Gỡ hiểu lầm', objection_handling: 'Gỡ rào cản', comparison: 'So sánh', process_walkthrough: 'Hướng dẫn quy trình', case_study: 'Câu chuyện thật', trust_building: 'Xây niềm tin', checklist: 'Checklist', story: 'Kể chuyện', conversion: 'Chuyển đổi' };
export const OPP_STATUSES = ['suggested', 'reviewed', 'approved', 'rejected', 'on_hold'];
export const STRENGTHS = ['strong', 'moderate', 'weak'];
export const STRENGTH_VI = { strong: 'Mạnh', moderate: 'Vừa', weak: 'Yếu' };

/** PRD §7.2 default weights (sum 1). */
export const WEIGHTS = { prevalence: 0.2, severity: 0.15, intent: 0.2, engagement: 0.1, evidence_strength: 0.15, freshness: 0.1, strategic_fit: 0.1 };
export const DIM_SCORE_VI = { prevalence: 'Độ phổ biến', severity: 'Mức nghiêm trọng', intent: 'Ý định tìm giải pháp', engagement: 'Tương tác', evidence_strength: 'Độ mạnh bằng chứng', freshness: 'Độ mới', strategic_fit: 'Phù hợp chiến lược' };
/** @type {[number, string][]} */
export const BANDS = [[80, 'Ưu tiên cao'], [60, 'Khá cao'], [40, 'Cần kiểm chứng thêm'], [0, 'Ưu tiên thấp']];
/** @param {number|null} score */
export const bandOf = (score) => (score == null ? null : BANDS.find(([min]) => score >= min)?.[1] ?? null);

/** How a run can be analysed again (PRD §9.2 #11). */
export const STAGES = /** @type {const} */ (['classify', 'topics', 'insights']);
export const STAGE_VI = { ingest: 'Nhập & chuẩn hoá', classify: 'Phân loại comment', topics: 'Gom chủ đề & nỗi đau', insights: 'Tổng hợp insight', validate: 'Kiểm tra insight', whys: '5 Whys', brief: '5W1H', opportunities: 'Cơ hội nội dung', evaluate: 'So sánh cơ hội' };

/** Labels after the owner's correction (their dims replace the AI's). @param {{labels?: any, userLabels?: any}|undefined} l */
export function effectiveLabels(l) {
  const base = l?.labels ?? {};
  const user = l?.userLabels ?? {};
  return Object.fromEntries(DIM_KEYS.map((d) => [d, Array.isArray(user[d]) ? user[d] : Array.isArray(base[d]) ? base[d] : []]));
}
