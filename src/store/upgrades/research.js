// research records embed the same video objects as video_search.
import { steps as videoSearch } from './video_search.js';

export const latest = 2;
/** @type {Record<number, (d: any) => any>} */
export const steps = { 1: (d) => videoSearch[1](d) };
