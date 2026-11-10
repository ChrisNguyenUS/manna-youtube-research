// Cancellation that reaches every await inside a job without threading a signal through each call.
// The job runner runs a handler inside runWithSignal(); YouTube calls and progress reports check it.
import { AsyncLocalStorage } from 'node:async_hooks';

export class CancelledError extends Error {
  constructor(message = 'cancelled') {
    super(message);
    this.name = 'CancelledError';
  }
}

/** @type {AsyncLocalStorage<{signal: AbortSignal, jobId: number|null}>} */
const als = new AsyncLocalStorage();

/** @template T @param {AbortSignal} signal @param {number|null} jobId @param {() => T} fn @returns {T} */
export const runWithSignal = (signal, jobId, fn) => als.run({ signal, jobId }, fn);

/** Throws CancelledError when the current job was cancelled or the app is stopping. */
export function throwIfCancelled() {
  if (als.getStore()?.signal.aborted) throw new CancelledError();
}

/** Id of the job this code runs for, if any (records written by a cancelled job are removed). */
export const currentJobId = () => als.getStore()?.jobId ?? null;

/** For catch blocks that swallow errors on purpose: never swallow a cancel. */
export function rethrowIfCancelled(e) {
  if (e?.name === 'CancelledError') throw e;
}
