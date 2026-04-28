import { setTimeout } from 'node:timers/promises';
/**
 * When sql contains multiple queries, result is an array of objects with rows property
 * This function unwraps the result into a single object with rows property
*/
function unwrapSQLResult(result) {
    if (Array.isArray(result)) {
        return { rows: result.flatMap(i => i.rows) };
    }
    return result;
}
function delay(ms, error, abortController) {
    const ac = abortController || new AbortController();
    const promise = new Promise((resolve, reject) => {
        setTimeout(ms, null, { signal: ac.signal })
            .then(() => {
            if (error) {
                reject(new Error(error));
            }
            else {
                resolve();
            }
        })
            .catch(resolve);
    });
    promise.abort = () => {
        if (!ac.signal.aborted) {
            ac.abort();
        }
    };
    return promise;
}
async function resolveWithinSeconds(promise, seconds, message, abortController) {
    const timeout = Math.max(1, seconds) * 1000;
    const reject = delay(timeout, message, abortController);
    let result;
    try {
        result = await Promise.race([promise, reject]);
    }
    finally {
        reject.abort();
    }
    return result;
}
export { delay, resolveWithinSeconds, unwrapSQLResult };
