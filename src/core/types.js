// Shared JSDoc types for the core and the ports. No runtime code.
/**
 * @typedef {object} Video
 * @property {string} id
 * @property {string} title
 * @property {string|null} channelId
 * @property {string} channelTitle
 * @property {number|null} views
 * @property {number|null} durationSec
 * @property {string|null} published   YouTube's relative text, e.g. "3 months ago"
 * @property {number|null} ageDays     estimate from `published`
 * @property {string|null} [publishedAt] exact ISO date when known
 * @property {boolean} isLive
 * @property {string[]} [regions]
 */
/** @typedef {{id: string, title: string, handle: string|null, subs: number|null, videoCount: number|null, country: string|null, joined: string|null, totalViews: number|null, avatar: string|null, description: string}} Channel */
/** @typedef {{id: string, text: string, likes: number, replies: number, published: string|null, ageDays: number|null, isReply: boolean, hearted: boolean}} Comment */
/** @typedef {{medianViews: number|null, medianVph: number|null, sample: number}} Baseline */
export {};
