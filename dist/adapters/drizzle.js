import { parsePlaceholders } from "./placeholders.js";
/**
 * Wraps a drizzle-orm transaction as an {@link IDatabase}.
 *
 * Accepts the `sql` tagged-template function from `drizzle-orm` as the
 * second argument so the adapter can construct parameterised queries
 * without a runtime dependency on `drizzle-orm`.
 *
 * @example
 * ```ts
 * import { sql } from 'drizzle-orm'
 * import { fromDrizzle } from 'pg-boss'
 *
 * await db.transaction(async (tx) => {
 *   await boss.send('my-queue', data, { db: fromDrizzle(tx, sql) })
 * })
 * ```
 */
export function fromDrizzle(tx, sql) {
    return {
        async executeSql(text, values) {
            const { parts, reordered } = parsePlaceholders(text, values);
            const strings = Object.assign([...parts], { raw: [...parts] });
            return tx.execute(sql(strings, ...reordered));
        }
    };
}
