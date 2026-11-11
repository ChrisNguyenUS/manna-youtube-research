// Port: what the app needs from TikTok (spec §3.1). Adapters: sources/tiktok (real), sources/fake/tiktok.js (tests).

/**
 * @typedef {object} TikTokVideo
 * @property {string} id            videoId
 * @property {string} url           https://www.tiktok.com/@user/video/<id>
 * @property {string} caption
 * @property {string[]} hashtags
 * @property {string|null} createdAt ISO
 * @property {number} durationSec
 * @property {number} plays
 * @property {number} likes
 * @property {number} comments
 * @property {number} shares
 * @property {number} saves
 * @property {string} author        @username of the video's creator (public), never of commenters
 * @property {string|null} cover    cover image (expiring link)
 * @property {string} query         keyword that found the video
 */
/**
 * @typedef {object} TikTokComment
 * @property {string} id
 * @property {string|null} parentId comment this one replies to
 * @property {boolean} isReply
 * @property {string} text
 * @property {number} likes
 * @property {number} replies
 * @property {string|null} createdAt ISO
 * @property {boolean} pinned
 * (No commenter name/username: parsers drop them on read.)
 */
/**
 * @typedef {object} TikTokSource
 * @property {(q: string, o?: {max?: number}, onPage?: (n: number) => void) => Promise<TikTokVideo[]>} searchVideos
 * @property {(urlOrId: string) => Promise<{id: string, url: string}>} resolveVideo   expands vm.tiktok.com / vt.tiktok.com
 * @property {(id: string, o?: {max?: number, replies?: boolean, maxRepliesPerComment?: number}, onProgress?: (n: number) => void) => Promise<{comments: TikTokComment[], total: number}>} getComments
 * @property {() => {searchReady: boolean, reason?: string}} capabilities   searchReady=false when Playwright is not installed
 * @property {() => Promise<void>} close   closes Chromium if open
 * @property {() => {requests: number, failures: number}} stats
 */

export {};
