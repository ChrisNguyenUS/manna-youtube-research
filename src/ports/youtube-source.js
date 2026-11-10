// Port: everything the app needs from YouTube. Adapters: sources/innertube (default),
// sources/fake (tests), sources/data-api (planned, official API with the user's key).
// Adapters normalize counts, dates and durations into core/types.js shapes.

/**
 * @typedef {{sort?: 'relevance'|'popularity'|'date', upload?: 'any'|'today'|'week'|'month'|'year', duration?: string,
 *   cc?: boolean, captions?: boolean, max?: number, gl?: string, regions?: (string|null)[]}} SearchOpts
 */

/**
 * @typedef {object} YouTubeSource
 * @property {(q: string, o?: SearchOpts, onPage?: (n: number) => void) => Promise<import('../core/types.js').Video[]>} searchVideos
 * @property {(q: string, o?: SearchOpts, onPage?: (n: number) => void) => Promise<any[]>} searchChannels
 * @property {(input: string) => Promise<string>} resolveChannelId
 * @property {(id: string, o?: {about?: boolean}) => Promise<import('../core/types.js').Channel>} getChannel
 * @property {(id: string, o?: {max?: number, channel?: any}, onPage?: (n: number) => void) => Promise<import('../core/types.js').Video[]>} getChannelVideos
 * @property {(id: string, o?: {max?: number}) => Promise<any[]>} getChannelShorts
 * @property {(id: string, o?: {likes?: boolean}) => Promise<any>} getVideo
 * @property {(id: string, o?: {max?: number, sort?: 'top'|'newest', replies?: boolean, maxRepliesPerThread?: number}, onProgress?: (n: number) => void) => Promise<{comments: import('../core/types.js').Comment[], disabled: boolean}>} getComments
 * @property {(q: string, o?: {gl?: string, hl?: string}) => Promise<string[]>} suggest
 * @property {(items: any[], fn: (x: any, i: number) => Promise<any>, onEach?: (done: number, total: number) => void) => Promise<any[]>} mapLimit
 * @property {() => {captionsFilter: boolean, ccFilter: boolean, globalSearch: boolean}} capabilities
 * @property {() => {requests: number, failures: number}} stats
 * @property {(o: Record<string, any>) => void} [configure]
 */

export {};
