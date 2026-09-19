export const abortError = () => new DOMException('Operation cancelled', 'AbortError');
export const isAbortError = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError';
export function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw abortError(); }
