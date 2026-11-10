// Port: persistence the use cases rely on. Adapter: store/sqlite (later: Postgres for SaaS).
// Every user-data method takes the workspace id first.

/**
 * @typedef {object} Store
 * @property {{getChannel: (id: string, o?: {maxAgeDays?: number, needAbout?: boolean}) => any, putChannel: (info: any, about: boolean) => void,
 *   getChannelVideos: (id: string, o?: {maxAgeDays?: number, min?: number}) => any[]|null, putChannelVideos: (id: string, list: any[]) => void,
 *   getVideo: (id: string, o?: {maxAgeDays?: number}) => any, putVideo: (d: any) => void}} cache  Public YouTube data, shared by workspaces.
 * @property {{add: (ws: string, kind: string, title: string, o?: {ref?: string|null, params?: any, data?: any, schemaVersion?: number, jobId?: number|null}) => number,
 *   get: (ws: string, id: number) => any, update: (ws: string, id: number, data: any, schemaVersion?: number) => void,
 *   list: (ws: string, kind?: string|null, limit?: number) => any[], remove: (ws: string, id: number) => void,
 *   latestByRef: (ws: string, kind: string, ref: string) => any, counts: (ws: string) => Record<string, number>}} records
 * @property {{list: (ws: string, kind?: string) => any[], put: (ws: string, kind: string, ref: string, title: string, data: any, note?: string) => void,
 *   note: (ws: string, kind: string, ref: string, note: string) => void, remove: (ws: string, kind: string, ref: string) => void, keys: (ws: string) => string[]}} saved
 * @property {{all: (ws: string) => Record<string, any>, set: (ws: string, o: Record<string, any>) => Record<string, any>}} settings
 * @property {any} jobs  Persistent jobs; only the job runner uses it.
 */

export {};
