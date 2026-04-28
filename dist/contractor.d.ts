import type * as types from './types.ts';
declare class Contractor {
    static constructionPlans(schema?: string, options?: {
        createSchema: boolean;
    }): string;
    static migrationPlans(schema?: string, version?: number): string;
    static rollbackPlans(schema?: string, version?: number): string;
    private config;
    private db;
    private migrations;
    constructor(db: types.IDatabase, config: types.ResolvedConstructorOptions);
    schemaVersion(): Promise<number | null>;
    isInstalled(): Promise<boolean>;
    start(): Promise<void>;
    check(): Promise<void>;
    create(): Promise<void>;
    migrate(version: number): Promise<void>;
    next(version: number): Promise<void>;
    rollback(version: number): Promise<void>;
}
export default Contractor;
//# sourceMappingURL=contractor.d.ts.map