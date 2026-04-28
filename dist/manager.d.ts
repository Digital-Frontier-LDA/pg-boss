import EventEmitter from 'node:events';
import type Db from './db.ts';
import type Timekeeper from './timekeeper.ts';
import * as types from './types.ts';
import Worker from './worker.ts';
import { type JobSpyInterface } from './spy.ts';
declare class Manager extends EventEmitter implements types.EventsMixin {
    #private;
    events: {
        error: string;
        wip: string;
    };
    db: (types.IDatabase & {
        _pgbdb?: false;
    }) | Db;
    config: types.ResolvedConstructorOptions;
    wipTs: number;
    workers: Map<string, Worker>;
    stopped: boolean | undefined;
    queueCacheInterval: NodeJS.Timeout | undefined;
    timekeeper: Timekeeper | undefined;
    queues: Record<string, types.QueueResult> | null;
    pendingOffWorkCleanups: Set<Promise<any>>;
    constructor(db: types.IDatabase, config: types.ResolvedConstructorOptions);
    getSpy<T = object>(name: string): JobSpyInterface<T>;
    clearSpies(): void;
    start(): Promise<void>;
    onCacheQueues({ emit }?: {
        emit?: boolean | undefined;
    }): Promise<void>;
    getQueueCache(name: string): Promise<types.QueueResult>;
    stop(): Promise<void>;
    failWip(): Promise<void>;
    work<ReqData>(name: string, handler: types.WorkHandler<ReqData>): Promise<string>;
    work<ReqData>(name: string, options: types.WorkOptions & {
        includeMetadata: true;
    }, handler: types.WorkWithMetadataHandler<ReqData>): Promise<string>;
    work<ReqData>(name: string, options: types.WorkOptions, handler: types.WorkHandler<ReqData>): Promise<string>;
    private addWorker;
    private removeWorker;
    private getWorkers;
    private emitWip;
    getWipData(options?: {
        includeInternal?: boolean;
    }): types.WipData[];
    hasPendingCleanups(): boolean;
    offWork(name: string, options?: types.OffWorkOptions): Promise<void>;
    notifyWorker(workerId: string): void;
    subscribe(event: string, name: string): Promise<void>;
    unsubscribe(event: string, name: string): Promise<void>;
    publish(event: string, data?: object, options?: types.SendOptions): Promise<void>;
    send(request: types.Request): Promise<string | null>;
    send(name: string, data?: object | null, options?: types.SendOptions | null): Promise<string | null>;
    sendAfter(name: string, data: object | null, options: types.SendOptions | null, after: Date | string | number): Promise<string | null>;
    sendThrottled(name: string, data: object | null, options: types.SendOptions | null, seconds: number, key?: string): Promise<string | null>;
    sendDebounced(name: string, data: object | null, options: types.SendOptions | null, seconds: number, key?: string): Promise<string | null>;
    createJob(request: types.Request): Promise<string | null>;
    insert(name: string, jobs: types.JobInsert[], options?: types.InsertOptions): Promise<string[] | null>;
    getDebounceStartAfter(singletonSeconds: number, clockOffset: number): number;
    fetch<T>(name: string): Promise<types.Job<T>[]>;
    fetch<T>(name: string, options: types.FetchOptions & {
        includeMetadata: true;
    }): Promise<types.JobWithMetadata<T>[]>;
    fetch<T>(name: string, options: types.FetchOptions): Promise<types.Job<T>[]>;
    private mapCompletionIdArg;
    private mapCompletionDataArg;
    private mapCommandResponse;
    complete(name: string, id: string | string[], data?: object | null, options?: types.CompleteOptions): Promise<types.CommandResponse>;
    fail(name: string, id: string | string[], data?: any, options?: types.ConnectionOptions): Promise<types.CommandResponse>;
    deleteJob(name: string, id: string | string[], options?: types.ConnectionOptions): Promise<types.CommandResponse>;
    cancel(name: string, id: string | string[], options?: types.ConnectionOptions): Promise<types.CommandResponse>;
    resume(name: string, id: string | string[], options?: types.ConnectionOptions): Promise<types.CommandResponse>;
    restore(name: string, id: string | string[], options?: types.ConnectionOptions): Promise<void>;
    retry(name: string, id: string | string[], options?: types.ConnectionOptions): Promise<types.CommandResponse>;
    touch(name: string, id: string | string[], options?: types.ConnectionOptions): Promise<types.CommandResponse>;
    createQueue(name: string, options?: Omit<types.Queue, 'name'> & {
        name?: string;
    }): Promise<void>;
    getBlockedKeys(name: string): Promise<string[]>;
    getQueues(names?: string | string[]): Promise<types.QueueResult[]>;
    updateQueue(name: string, options?: types.UpdateQueueOptions): Promise<void>;
    getQueue(name: string): Promise<any>;
    deleteQueue(name: string): Promise<void>;
    deleteQueuedJobs(name: string): Promise<void>;
    deleteStoredJobs(name: string): Promise<void>;
    deleteAllJobs(name?: string): Promise<void>;
    getQueueStats(name: string): Promise<any>;
    getJobById<T>(name: string, id: string, options?: types.ConnectionOptions): Promise<types.JobWithMetadata<T> | null>;
    findJobs<T>(name: string, options?: types.FindJobsOptions): Promise<types.JobWithMetadata<T>[]>;
    private assertDb;
}
export default Manager;
//# sourceMappingURL=manager.d.ts.map