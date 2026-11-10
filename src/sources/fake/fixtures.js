// Deterministic data for tests of features and HTTP. Two channels: a small one whose video
// is a big outlier, and a big one whose video is ordinary.
export const VIDEOS = [
  { id: 'aaaaaaaaaaa', title: 'Bí mật 1979 không ai kể', channelId: 'UC_small_______________', channelTitle: 'Kênh Nhỏ', channelHandle: '@nho', views: 500000, durationSec: 900, published: '2 months ago', ageDays: 61, isLive: false, description: 'bí mật 1979' },
  { id: 'bbbbbbbbbbb', title: 'Lịch sử Việt Nam tóm tắt', channelId: 'UC_big_________________', channelTitle: 'Kênh To', channelHandle: '@to', views: 900000, durationSec: 1500, published: '1 year ago', ageDays: 365, isLive: false, description: '' },
];

export const CHANNELS = {
  UC_small_______________: { id: 'UC_small_______________', title: 'Kênh Nhỏ', handle: '@nho', subs: 5000, videoCount: 40, country: 'VN', joined: '2025-01-01', totalViews: 2e6, avatar: null, description: '' },
  UC_big_________________: { id: 'UC_big_________________', title: 'Kênh To', handle: '@to', subs: 2e6, videoCount: 900, country: 'VN', joined: '2015-01-01', totalViews: 9e8, avatar: null, description: '' },
};

/** 30 weekly uploads per channel: 2K views each on the small channel, 300K on the big one. */
export const CHANNEL_VIDEOS = (id) =>
  Array.from({ length: 30 }, (_, i) => ({
    id: `${id.slice(3, 9)}v${String(i).padStart(4, '0')}`.slice(0, 11),
    title: `video ${i}`,
    channelId: id,
    channelTitle: '',
    views: id.includes('small') ? 2000 : 300000,
    durationSec: 800,
    published: `${i + 1} weeks ago`,
    ageDays: (i + 1) * 7,
    isLive: false,
  }));
