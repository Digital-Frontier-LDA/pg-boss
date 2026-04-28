import { parsePlaceholders } from "./placeholders.js";
export function fromKnex(trx) {
    return {
        async executeSql(text, values) {
            // pg-boss emits $1, $2, … placeholders; knex.raw() expects ? per binding,
            // so each textual occurrence (including reuse of the same $N) must be
            // mapped to its own ? with the value duplicated in textual order.
            const { parts, reordered } = parsePlaceholders(text, values);
            const knexSql = parts.join('?');
            const result = await trx.raw(knexSql, reordered);
            return { rows: result.rows };
        }
    };
}
