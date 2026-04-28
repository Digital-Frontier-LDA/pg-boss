/**
 * When sql contains multiple queries, result is an array of objects with rows property
 * This function unwraps the result into a single object with rows property
*/
declare function unwrapSQLResult(result: {
    rows: any[];
} | {
    rows: any[];
}[]): {
    rows: any[];
};
export interface AbortablePromise<T> extends Promise<T> {
    abort: () => void;
}
declare function delay(ms: number, error?: string, abortController?: AbortController): AbortablePromise<void>;
declare function resolveWithinSeconds<T>(promise: Promise<T>, seconds: number, message?: string, abortController?: AbortController): Promise<T | void>;
export { delay, resolveWithinSeconds, unwrapSQLResult };
//# sourceMappingURL=tools.d.ts.map