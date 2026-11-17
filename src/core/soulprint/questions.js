// The Soulprint brainstorm: twelve questions, one at a time. Wording and order follow the brand-game and niche
// interviews (the unfair advantage comes before the authority statement: the "cách của tôi" slot is drafted from it);
// the pillars question follows Kallaway's positioning chapter. `target` is the profile field a rambled answer fits.

export const INTRO = 'Khoảng 10 phút. Cứ trả lời dài dòng, lộn xộn cũng được; dùng đọc chính tả nếu tiện. Gọn lại là việc của app.';

/** @type {{id: string, section: string, target: string, title: string, ask: string, push: string, example?: {bad: string, good: string}}[]} */
export const QUESTIONS = [
  { id: 'q0', section: 'channels', target: 'channels', title: 'Kênh đang có',
    ask: 'Bạn đã có kênh nào đang đăng chưa, dù ít? Dán handle hoặc link, mỗi dòng một kênh. Nếu bắt đầu từ số 0 thì cứ nói vậy.', push: '' },
  { id: 'q1', section: 'business', target: 'business.note', title: 'Việc kinh doanh',
    ask: 'Bạn bán gì, hoặc định bán gì? Giá khoảng bao nhiêu, mua bằng cách nào, và ai là người thật sự trả tiền?',
    push: 'Chưa có sản phẩm thì bạn hình dung sẽ kiếm tiền từ đâu: sản phẩm, dịch vụ, phần mềm, tài trợ?' },
  { id: 'q2', section: 'game', target: 'gameReason', title: 'Game',
    ask: 'Có hai game, và ai cũng nói muốn cả hai. Bạn muốn nổi tiếng rộng trong một lĩnh vực lớn, hay được một nhóm hẹp coi là số một? Đi từ hẹp ra rộng thì được; đi từ rộng về hẹp rất khó. Chọn một, và nói vì sao.',
    push: '"Cả hai" không được tính. Nếu 18 tháng nữa chỉ được một thứ: 1 triệu follower phần lớn không mua, hay 30.000 follower có mua? Nếu vẫn chưa chọn được: bạn muốn người ta gọi mình là "người chuyên về [lĩnh vực]", hay "người nổi tiếng có làm thêm [lĩnh vực]"?' },
  { id: 'q3', section: 'game', target: 'objective', title: 'Mục tiêu',
    ask: 'Mục tiêu 12 đến 18 tháng, trong một câu: thương hiệu này phải tạo ra thứ gì cụ thể? (Số cuộc hẹn, số khách, số đơn, danh sách nhà tài trợ…)',
    push: 'Mục tiêu này có khớp với game vừa chọn không? Chọn "rộng" mà mục tiêu là "20 khách giá cao" thì nên chọn lại một trong hai.' },
  { id: 'q4', section: 'avatar', target: 'avatar.portrait', title: 'Avatar',
    ask: 'Hãy tưởng tượng người xem lý tưởng nhất đang ngồi trên ghế trước mặt bạn. Họ là ai? Cả ngày họ làm gì? Họ đang cố làm việc gì mà chưa được, và đã thử những gì rồi?',
    push: 'Đừng dừng ở một nhóm người chung chung. Một người thật bạn từng bán cho, khớp mô tả này, là ai? Tả người đó.',
    example: { bad: 'Người bận rộn 25 đến 45 tuổi.', good: 'Chủ spa 34 tuổi, doanh thu 40.000 đô một tháng, đăng bài thất thường và không có khách nào từ đó.' } },
  { id: 'q5', section: 'dreamOutcome', target: 'dreamOutcome', title: 'Kết quả mơ tới',
    ask: 'Người đó rốt cuộc muốn tới đâu trong thế giới của bạn? Không phải tính năng, mà là phần thưởng cuối cùng.',
    push: 'Nói trong một câu, bằng lời họ sẽ nói.',
    example: { bad: 'Kịch bản hay hơn.', good: 'Một cỗ máy content mỗi tuần mang khách tự tìm tới.' } },
  { id: 'q6', section: 'pains', target: 'pains', title: 'Kho nỗi đau',
    ask: 'Họ hỏi bạn gì trong tin nhắn, hoặc ngay trước khi mua? Và niềm tin sai nào bạn phải sửa đi sửa lại? Mỗi dòng một nỗi đau.',
    push: 'Cần 5 đến 10 nỗi đau cụ thể, có cả câu hỏi lớn lẫn việc nhỏ. Mở comment của bạn và của kênh khác ra mà chép.' },
  { id: 'q7', section: 'advantage', target: 'advantage', title: 'Lợi thế riêng',
    ask: 'Lợi thế riêng của bạn là gì? Kết quả đã làm được, lần vấp đau, bằng cấp, quá trình làm nghề, hay một cách giải thích mà phần lớn người trong ngành không dám nhận là của mình.',
    push: 'Cứ kể dài. Chỗ nào người khác trong ngành không nói được như bạn?' },
  { id: 'q8', section: 'oneThing', target: 'oneThing', title: 'Điều duy nhất',
    ask: 'Điền vào chỗ trống: khi ai đó trong thế giới của tôi cần ______, tôi muốn là cái tên đầu tiên họ nghĩ tới.',
    push: 'Nếu ra ba thứ, giữ thứ khớp nhất với người trả tiền ở câu 1 và avatar ở câu 4.' },
  { id: 'q9', section: 'statement', target: 'statement.chosen', title: 'Câu định vị',
    ask: 'Viết câu "Tôi giúp [ai] với [việc gì] theo cách [cách của tôi]". Phần "cách của tôi" lấy từ lợi thế ở câu 7, không lấy từ nỗi đau.',
    push: 'Viết thêm hai dạng khác: "Tôi giúp [ai] [làm gì] để [đạt gì]" và "[Chủ đề] cho [ai]".',
    example: { bad: 'Tôi giúp chủ doanh nghiệp phát triển.', good: 'Tôi giúp chủ phòng khám biến video ngắn thành lịch hẹn.' } },
  { id: 'q10', section: 'filter', target: 'filter', title: 'Câu lọc',
    ask: 'Câu bạn sẽ tự hỏi trước mỗi video: "Cái này có thật sự có giá trị với [avatar trong 5 từ] không?" Có thì làm, không thì bỏ. Viết câu đó cho avatar của bạn.',
    push: 'Thêm câu thứ hai nếu muốn: "Nó có làm họ tin mình hơn không?"' },
  { id: 'q11', section: 'pillars', target: 'pillars', title: 'Pillars',
    ask: 'Ba đến năm trụ nội dung của bạn là gì? Mỗi dòng một trụ. Với mỗi trụ, nghĩ sẵn một niềm tin đi ngược số đông và bằng chứng bạn có.',
    push: 'Thử kể nhanh 20 chủ đề con cho mỗi trụ. Không kể nổi thì trụ quá hẹp, hoặc bạn chưa đủ mê nó. Ba điều phải cùng có: avatar cần, bạn có bằng chứng, chủ đề đủ rộng.' },
];

/** Shown with the game question. */
export const GAME_TABLE = {
  head: ['', 'Rộng (Mass Reach)', 'Trúng (Efficient Conversion)'],
  rows: [
    ['Tiền về bằng cách nào', 'Phủ rộng trước, một phần nhỏ mua sau, qua nhiều sản phẩm', 'Người xem thành người mua, đo được trực tiếp'],
    ['Được gì', 'Tổng tiền lớn hơn nhiều; ai cũng biết mặt', 'Thắng nhanh hơn nhiều; tiền trên mỗi follower cao hơn nhiều'],
    ['Mất gì', 'Lâu hơn hẳn; chịu mặt trái của nổi tiếng; khán giả chung chung', 'Không có fan đại chúng'],
    ['Đổi hướng', 'Khó thu hẹp lại', 'Mở rộng ra sau được'],
  ],
};
