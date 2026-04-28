import * as types from './types.ts';
declare function rollback(schema: string, version: number, migrations?: types.Migration[]): string;
declare function next(schema: string, version: number, migrations: types.Migration[] | undefined): string;
declare function migrate(schema: string, version: number, migrations?: types.Migration[]): string;
declare function getAll(schema: string): types.Migration[];
export { rollback, next, migrate, getAll, };
//# sourceMappingURL=migrationStore.d.ts.map