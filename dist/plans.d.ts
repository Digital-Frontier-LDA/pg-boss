import type { UpdateQueueOptions } from './types.ts';
export interface SqlQuery {
    text: string;
    values: unknown[];
}
declare const DEFAULT_SCHEMA = "pgboss";
declare const MIGRATE_RACE_MESSAGE = "division by zero";
declare const CREATE_RACE_MESSAGE = "already exists";
declare const JOB_STATES: Readonly<{
    created: "created";
    retry: "retry";
    active: "active";
    completed: "completed";
    cancelled: "cancelled";
    failed: "failed";
}>;
declare const QUEUE_POLICIES: Readonly<{
    standard: "standard";
    short: "short";
    singleton: "singleton";
    stately: "stately";
    exclusive: "exclusive";
    key_strict_fifo: "key_strict_fifo";
}>;
declare function create(schema: string, version: number, options?: {
    createSchema?: boolean;
}): string;
declare function createTableWarning(schema: string): string;
declare function createIndexWarning(schema: string): string;
declare function createQueue(schema: string, name: string, options: unknown): string;
declare function deleteQueue(schema: string, name: string): string;
declare function trySetQueueMonitorTime(schema: string, queues: string[], seconds: number): SqlQuery;
declare function trySetQueueDeletionTime(schema: string, queues: string[], seconds: number): SqlQuery;
declare function trySetCronTime(schema: string, seconds: number): string;
declare function trySetBamTime(schema: string, seconds: number): string;
declare function updateQueue(schema: string, { deadLetter }?: UpdateQueueOptions): string;
declare function getQueues(schema: string, names?: string[]): SqlQuery;
declare function deleteJobsById(schema: string, table: string): string;
declare function deleteQueuedJobs(schema: string, table: string): string;
declare function deleteStoredJobs(schema: string, table: string): string;
declare function truncateTable(schema: string, table: string): string;
declare function deleteAllJobs(schema: string, table: string): string;
declare function getSchedules(schema: string): string;
declare function getSchedulesByQueue(schema: string): string;
declare function schedule(schema: string): string;
declare function unschedule(schema: string): string;
declare function subscribe(schema: string): string;
declare function unsubscribe(schema: string): string;
declare function getQueuesForEvent(schema: string): string;
declare function getTime(): string;
declare function insertWarning(schema: string): string;
declare function getWarnings(schema: string): string;
declare function getWarningsCount(schema: string): string;
declare function deleteOldWarnings(schema: string, days: number): string;
declare function getVersion(schema: string): string;
declare function setVersion(schema: string, version: number): string;
declare function versionTableExists(schema: string): string;
declare function insertVersion(schema: string, version: number): string;
interface GroupConcurrencyConfig {
    default: number;
    tiers?: Record<string, number>;
}
interface FetchJobOptions {
    schema: string;
    table: string;
    name: string;
    policy: string | undefined;
    limit: number;
    includeMetadata?: boolean;
    priority?: boolean;
    orderByCreatedOn?: boolean;
    ignoreStartAfter?: boolean;
    ignoreSingletons: string[] | null;
    ignoreGroups?: string[] | null;
    groupConcurrency?: number | GroupConcurrencyConfig;
    minPriority?: number;
    maxPriority?: number;
}
declare function fetchNextJob(options: FetchJobOptions): SqlQuery;
declare function completeJobs(schema: string, table: string, includeQueued?: boolean): string;
declare function cancelJobs(schema: string, table: string): string;
declare function resumeJobs(schema: string, table: string): string;
declare function restoreJobs(schema: string, table: string): string;
interface InsertJobsOptions {
    table: string;
    name: string;
    returnId?: boolean;
}
declare function insertJobs(schema: string, { table, name, returnId }: InsertJobsOptions): string;
declare function failJobsById(schema: string, table: string): string;
declare function failJobsByTimeout(schema: string, table: string, queues: string[]): string;
declare function failJobsByHeartbeat(schema: string, table: string, queues: string[]): string;
declare function touchJobs(schema: string, table: string): string;
declare function deletion(schema: string, table: string, queues: string[]): string;
declare function retryJobs(schema: string, table: string): string;
declare function getQueueStats(schema: string, table: string, queues: string[]): SqlQuery;
declare function cacheQueueStats(schema: string, table: string, queues: string[]): string;
declare function serializeArrayParam(values: string[]): string;
declare function locked(schema: string, query: string | string[], key?: string): string;
declare function assertMigration(schema: string, version: number): string;
declare function findJobs(schema: string, table: string, options: {
    queued: boolean;
    byKey: boolean;
    byData: boolean;
    byId: boolean;
}): string;
declare function getJobById(schema: string, table: string): string;
declare function getBlockedKeys(schema: string, table: string): string;
declare function getNextBamCommand(schema: string): string;
declare function setBamCompleted(schema: string, id: string): string;
declare function setBamFailed(schema: string, id: string, error: string): string;
declare function getBamStatus(schema: string): string;
declare function getBamEntries(schema: string): string;
export { create, insertVersion, getVersion, setVersion, versionTableExists, fetchNextJob, completeJobs, cancelJobs, resumeJobs, restoreJobs, retryJobs, findJobs, deleteJobsById, deleteAllJobs, deleteQueuedJobs, deleteStoredJobs, truncateTable, failJobsById, failJobsByTimeout, failJobsByHeartbeat, touchJobs, insertJobs, getTime, getSchedules, getSchedulesByQueue, schedule, unschedule, subscribe, unsubscribe, getQueuesForEvent, deletion, cacheQueueStats, updateQueue, createQueue, deleteQueue, getQueues, getQueueStats, trySetQueueMonitorTime, trySetQueueDeletionTime, trySetCronTime, trySetBamTime, locked, assertMigration, getJobById, insertWarning, getWarnings, getWarningsCount, deleteOldWarnings, createTableWarning, createIndexWarning, getBlockedKeys, getNextBamCommand, setBamCompleted, setBamFailed, getBamStatus, getBamEntries, serializeArrayParam, QUEUE_POLICIES, JOB_STATES, MIGRATE_RACE_MESSAGE, CREATE_RACE_MESSAGE, DEFAULT_SCHEMA, };
//# sourceMappingURL=plans.d.ts.map