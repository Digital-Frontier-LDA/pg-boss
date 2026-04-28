import EventEmitter from 'node:events';
import type * as types from './types.ts';
import type { JobSpyInterface } from './spy.ts';
export { JOB_STATES as states } from './plans.ts';
export { QUEUE_POLICIES as policies } from './plans.ts';
export declare const events: types.Events;
export declare function getConstructionPlans(schema?: string): string;
export declare function getMigrationPlans(schema?: string, version?: number): string;
export declare function getRollbackPlans(schema?: string, version?: number): string;
export declare class PgBoss extends EventEmitter<types.PgBossEventMap> {
    #private;
    constructor(connectionString: string);
    constructor(options: types.ConstructorOptions);
    start(): Promise<this>;
    stop(options?: types.StopOptions): Promise<void>;
    send(request: types.Request): Promise<string | null>;
    send(name: string, data?: object | null, options?: types.SendOptions): Promise<string | null>;
    sendAfter(name: string, data: object | null, options: types.SendOptions | null, date: Date): Promise<string | null>;
    sendAfter(name: string, data: object | null, options: types.SendOptions | null, dateString: string): Promise<string | null>;
    sendAfter(name: string, data: object | null, options: types.SendOptions | null, seconds: number): Promise<string | null>;
    sendThrottled(name: string, data: object | null, options: types.SendOptions | null, seconds: number, key?: string): Promise<string | null>;
    sendDebounced(name: string, data: object | null, options: types.SendOptions | null, seconds: number, key?: string): Promise<string | null>;
    insert(name: string, jobs: types.JobInsert[], options?: types.InsertOptions): Promise<string[] | null>;
    fetch<T>(name: string, options: types.FetchOptions & {
        includeMetadata: true;
    }): Promise<types.JobWithMetadata<T>[]>;
    fetch<T>(name: string, options?: types.FetchOptions): Promise<types.Job<T>[]>;
    work<ReqData, ResData = any>(name: string, handler: types.WorkHandler<ReqData, ResData>): Promise<string>;
    work<ReqData, ResData = any>(name: string, options: types.WorkOptions & {
        includeMetadata: true;
    }, handler: types.WorkWithMetadataHandler<ReqData, ResData>): Promise<string>;
    work<ReqData, ResData = any>(name: string, options: types.WorkOptions, handler: types.WorkHandler<ReqData, ResData>): Promise<string>;
    offWork(name: string, options?: types.OffWorkOptions): Promise<void>;
    notifyWorker(workerId: string): void;
    subscribe(event: string, name: string): Promise<void>;
    unsubscribe(event: string, name: string): Promise<void>;
    publish(event: string, data?: object, options?: types.SendOptions): Promise<void>;
    cancel(name: string, id: string | string[], options?: types.ConnectionOptions): Promise<types.CommandResponse>;
    resume(name: string, id: string | string[], options?: types.ConnectionOptions): Promise<types.CommandResponse>;
    retry(name: string, id: string | string[], options?: types.ConnectionOptions): Promise<types.CommandResponse>;
    deleteJob(name: string, id: string | string[], options?: types.ConnectionOptions): Promise<types.CommandResponse>;
    deleteQueuedJobs(name: string): Promise<void>;
    deleteStoredJobs(name: string): Promise<void>;
    deleteAllJobs(name?: string): Promise<void>;
    complete(name: string, id: string | string[], data?: object | null, options?: types.CompleteOptions): Promise<types.CommandResponse>;
    fail(name: string, id: string | string[], data?: object | null, options?: types.ConnectionOptions): Promise<types.CommandResponse>;
    touch(name: string, id: string | string[], options?: types.ConnectionOptions): Promise<types.CommandResponse>;
    /**
     * @deprecated Use findJobs() instead
     */
    getJobById<T>(name: string, id: string, options?: types.ConnectionOptions): Promise<types.JobWithMetadata<T> | null>;
    findJobs<T>(name: string, options?: types.FindJobsOptions): Promise<types.JobWithMetadata<T>[]>;
    createQueue(name: string, options?: Omit<types.Queue, 'name'>): Promise<void>;
    getBlockedKeys(name: string): Promise<string[]>;
    updateQueue(name: string, options?: types.UpdateQueueOptions): Promise<void>;
    deleteQueue(name: string): Promise<void>;
    getQueues(names?: string[]): Promise<types.QueueResult[]>;
    getQueue(name: string): Promise<types.QueueResult | null>;
    getQueueStats(name: string): Promise<types.QueueResult>;
    isMaintaining(): boolean;
    isBamWorking(): boolean;
    isCheckingSkew(): boolean;
    supervise(name?: string): Promise<void>;
    getWipData(options?: {
        includeInternal?: boolean;
    }): types.WipData[];
    getSpy<T = object>(name: string): JobSpyInterface<T>;
    clearSpies(): void;
    isInstalled(): Promise<boolean>;
    schemaVersion(): Promise<number | null>;
    schedule(name: string, cron: string, data?: object | null, options?: types.ScheduleOptions): Promise<void>;
    unschedule(name: string, key?: string): Promise<void>;
    getSchedules(name?: string, key?: string): Promise<types.Schedule[]>;
    getBamStatus(): Promise<types.BamStatusSummary[]>;
    getBamEntries(): Promise<types.BamEntry[]>;
    getDb(): types.IDatabase;
}
export type { BamEntry, BamEvent, BamStatusSummary, CommandResponse, CompleteOptions, ConnectionOptions, ConstructorOptions, FetchOptions, FindJobsOptions, GroupConcurrencyConfig, GroupOptions, IDatabase as Db, InsertOptions, Job, JobFetchOptions, JobInsert, JobOptions, JobPollingOptions, JobStates, Events, JobWithMetadata, MaintenanceOptions, OffWorkOptions, Queue, QueueOptions, QueuePolicy, QueueResult, Request, Schedule, ScheduleOptions, SchedulingOptions, SendOptions, StopOptions, WipData, WorkHandler, WorkOptions, WorkWithMetadataHandler, } from './types.ts';
export type { JobSpyInterface, JobSpyState, JobDataSelector, JobSelector, SpyJob, } from './spy.ts';
export { fromKnex, fromKysely, fromDrizzle, fromPrisma, } from './adapters/index.ts';
export type { KnexTransactionLike, KyselyTransactionLike, DrizzleTransactionLike, DrizzleSqlTagLike, PrismaTransactionLike, } from './adapters/index.ts';
//# sourceMappingURL=index.d.ts.map