import EventEmitter from 'node:events';
import * as Attorney from "./attorney.js";
import Contractor from "./contractor.js";
import Manager from "./manager.js";
import Timekeeper from "./timekeeper.js";
import Boss from "./boss.js";
import Bam from "./bam.js";
import { delay } from "./tools.js";
import * as plans from "./plans.js";
import DbDefault from "./db.js";
export { JOB_STATES as states } from "./plans.js";
export { QUEUE_POLICIES as policies } from "./plans.js";
export const events = Object.freeze({
    error: 'error',
    warning: 'warning',
    wip: 'wip',
    stopped: 'stopped',
    bam: 'bam'
});
export function getConstructionPlans(schema) {
    return Contractor.constructionPlans(schema);
}
export function getMigrationPlans(schema, version) {
    return Contractor.migrationPlans(schema, version);
}
export function getRollbackPlans(schema, version) {
    return Contractor.rollbackPlans(schema, version);
}
export class PgBoss extends EventEmitter {
    #stoppingOn;
    #stopped;
    #starting;
    #started;
    #config;
    #db;
    #boss;
    #contractor;
    #manager;
    #timekeeper;
    #bam;
    constructor(value) {
        super();
        this.#stoppingOn = null;
        this.#stopped = true;
        const config = Attorney.getConfig(value);
        this.#config = config;
        const db = this.getDb();
        this.#db = db;
        if ('_pgbdb' in this.#db && this.#db._pgbdb) {
            this.#promoteEvents(this.#db);
        }
        const contractor = new Contractor(db, config);
        const manager = new Manager(db, config);
        const boss = new Boss(db, manager, config);
        const timekeeper = new Timekeeper(db, manager, config);
        manager.timekeeper = timekeeper;
        const bam = new Bam(db, config);
        this.#promoteEvents(manager);
        this.#promoteEvents(boss);
        this.#promoteEvents(timekeeper);
        this.#promoteEvents(bam);
        this.#boss = boss;
        this.#contractor = contractor;
        this.#manager = manager;
        this.#timekeeper = timekeeper;
        this.#bam = bam;
    }
    #promoteEvents(emitter) {
        for (const event of Object.values(emitter?.events)) {
            emitter.on(event, arg => this.emit(event, arg));
        }
    }
    async start() {
        if (this.#starting || this.#started) {
            return this;
        }
        this.#starting = true;
        if (this.#db._pgbdb && !this.#db.opened) {
            await this.#db.open();
        }
        if (this.#config.migrate) {
            await this.#contractor.start();
        }
        else {
            await this.#contractor.check();
        }
        await this.#manager.start();
        if (this.#config.supervise) {
            await this.#boss.start();
        }
        if (this.#config.schedule) {
            await this.#timekeeper.start();
        }
        if (this.#config.migrate) {
            await this.#bam.start();
        }
        this.#starting = false;
        this.#started = true;
        this.#stopped = false;
        return this;
    }
    async stop(options = {}) {
        if (this.#stoppingOn || this.#stopped) {
            return;
        }
        let { close = true, graceful = true, timeout = 30000 } = options;
        timeout = Math.max(timeout, 1000);
        this.#stoppingOn = Date.now();
        await this.#manager.stop();
        await this.#timekeeper.stop();
        await this.#boss.stop();
        await this.#bam.stop();
        const shutdown = async () => {
            await this.#manager.failWip();
            if (this.#db._pgbdb && this.#db.opened && close) {
                await this.#db.close();
                // Give event loop time to process socket closes
                await delay(10);
            }
            this.#stopped = true;
            this.#stoppingOn = null;
            this.#started = false;
            this.emit(events.stopped);
        };
        if (!graceful) {
            return await shutdown();
        }
        while ((Date.now() - this.#stoppingOn) < timeout && this.#manager.hasPendingCleanups()) {
            await delay(500);
        }
        await shutdown();
    }
    async send(...args) {
        return await this.#manager.send(...args);
    }
    async sendAfter(name, data, options, after) {
        return this.#manager.sendAfter(name, data, options, after);
    }
    sendThrottled(name, data, options, seconds, key) {
        return this.#manager.sendThrottled(name, data, options, seconds, key);
    }
    sendDebounced(name, data, options, seconds, key) {
        return this.#manager.sendDebounced(name, data, options, seconds, key);
    }
    insert(name, jobs, options) {
        return this.#manager.insert(name, jobs, options);
    }
    fetch(name, options = {}) {
        return this.#manager.fetch(name, options);
    }
    work(...args) {
        return this.#manager.work(...args);
    }
    offWork(name, options) {
        return this.#manager.offWork(name, options);
    }
    notifyWorker(workerId) {
        return this.#manager.notifyWorker(workerId);
    }
    subscribe(event, name) {
        return this.#manager.subscribe(event, name);
    }
    unsubscribe(event, name) {
        return this.#manager.unsubscribe(event, name);
    }
    publish(event, data, options) {
        return this.#manager.publish(event, data, options);
    }
    cancel(name, id, options) {
        return this.#manager.cancel(name, id, options);
    }
    resume(name, id, options) {
        return this.#manager.resume(name, id, options);
    }
    retry(name, id, options) {
        return this.#manager.retry(name, id, options);
    }
    deleteJob(name, id, options) {
        return this.#manager.deleteJob(name, id, options);
    }
    deleteQueuedJobs(name) {
        return this.#manager.deleteQueuedJobs(name);
    }
    deleteStoredJobs(name) {
        return this.#manager.deleteStoredJobs(name);
    }
    deleteAllJobs(name) {
        return this.#manager.deleteAllJobs(name);
    }
    complete(name, id, data, options) {
        return this.#manager.complete(name, id, data, options);
    }
    fail(name, id, data, options) {
        return this.#manager.fail(name, id, data, options);
    }
    touch(name, id, options) {
        return this.#manager.touch(name, id, options);
    }
    /**
     * @deprecated Use findJobs() instead
     */
    getJobById(name, id, options) {
        return this.#manager.getJobById(name, id, options);
    }
    findJobs(name, options) {
        return this.#manager.findJobs(name, options);
    }
    createQueue(name, options) {
        return this.#manager.createQueue(name, options);
    }
    getBlockedKeys(name) {
        return this.#manager.getBlockedKeys(name);
    }
    updateQueue(name, options) {
        return this.#manager.updateQueue(name, options);
    }
    deleteQueue(name) {
        return this.#manager.deleteQueue(name);
    }
    getQueues(names) {
        return this.#manager.getQueues();
    }
    getQueue(name) {
        return this.#manager.getQueue(name);
    }
    getQueueStats(name) {
        return this.#manager.getQueueStats(name);
    }
    isMaintaining() {
        return this.#boss.maintaining;
    }
    isBamWorking() {
        return this.#bam.working;
    }
    isCheckingSkew() {
        return this.#timekeeper.checkingSkew;
    }
    supervise(name) {
        return this.#boss.supervise(name);
    }
    getWipData(options) {
        return this.#manager.getWipData(options);
    }
    getSpy(name) {
        return this.#manager.getSpy(name);
    }
    clearSpies() {
        this.#manager.clearSpies();
    }
    isInstalled() {
        return this.#contractor.isInstalled();
    }
    schemaVersion() {
        return this.#contractor.schemaVersion();
    }
    schedule(name, cron, data, options) {
        return this.#timekeeper.schedule(name, cron, data, options);
    }
    unschedule(name, key) {
        return this.#timekeeper.unschedule(name, key);
    }
    getSchedules(name, key) {
        return this.#timekeeper.getSchedules(name, key);
    }
    async getBamStatus() {
        const sql = plans.getBamStatus(this.#config.schema);
        const { rows } = await this.#db.executeSql(sql);
        return rows;
    }
    async getBamEntries() {
        const sql = plans.getBamEntries(this.#config.schema);
        const { rows } = await this.#db.executeSql(sql);
        return rows;
    }
    getDb() {
        if (this.#db) {
            return this.#db;
        }
        if (this.#config.db) {
            return this.#config.db;
        }
        return new DbDefault(this.#config);
    }
}
export { fromKnex, fromKysely, fromDrizzle, fromPrisma, } from "./adapters/index.js";
