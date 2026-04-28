import assert from 'node:assert';
import * as plans from "./plans.js";
import * as types from "./types.js";
function flatten(schema, commands, version) {
    commands.unshift(plans.assertMigration(schema, version));
    commands.push(plans.setVersion(schema, version));
    return plans.locked(schema, commands);
}
function rollback(schema, version, migrations) {
    migrations = migrations || getAll(schema);
    const result = migrations.find(i => i.version === version);
    assert(result, `Version ${version} not found.`);
    return flatten(schema, result.uninstall || [], result.previous);
}
function next(schema, version, migrations) {
    migrations = migrations || getAll(schema);
    const result = migrations.find(i => i.previous === version);
    assert(result, `Version ${version} not found.`);
    return flatten(schema, result.install, result.version);
}
function migrate(schema, version, migrations) {
    migrations = migrations || getAll(schema);
    const result = migrations
        .filter(i => i.previous >= version)
        .sort((a, b) => a.version - b.version)
        .reduce((acc, migration) => {
        acc.install = acc.install.concat(migration.install);
        if (migration.async) {
            const bamCommands = migration.async.map(cmd => cmd.replace(/\$VERSION\$/g, String(migration.version)));
            acc.install = acc.install.concat(bamCommands);
        }
        acc.version = migration.version;
        return acc;
    }, { install: [], version });
    assert(result.install.length > 0, `Version ${version} not found.`);
    return flatten(schema, result.install, result.version);
}
function getAll(schema) {
    return [
        {
            release: '11.1.0',
            version: 26,
            previous: 25,
            install: [
                `
        CREATE OR REPLACE FUNCTION ${schema}.create_queue(queue_name text, options jsonb)
        RETURNS VOID AS
        $$
          INSERT INTO ${schema}.queue (
            name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
            expire_seconds, retention_seconds, deletion_seconds, warning_queued,
            dead_letter, partition, table_name
          )
          VALUES (
            $1,
            $2->>'policy',
            COALESCE(($2->>'retryLimit')::int, 2),
            COALESCE(($2->>'retryDelay')::int, 0),
            COALESCE(($2->>'retryBackoff')::bool, false),
            ($2->>'retryDelayMax')::int,
            COALESCE(($2->>'expireInSeconds')::int, 900),
            COALESCE(($2->>'retentionSeconds')::int, 1209600),
            COALESCE(($2->>'deleteAfterSeconds')::int, 604800),
            COALESCE(($2->>'warningQueueSize')::int, 0),
            $2->>'deadLetter',
            false,
            'job'
          )
          ON CONFLICT DO NOTHING
        $$
        LANGUAGE sql;
        `,
                `CREATE UNIQUE INDEX job_i6 ON ${schema}.job (name, COALESCE(singleton_key, '')) WHERE state <= 'active' AND policy = 'exclusive'`
            ],
            uninstall: [
                `DROP INDEX ${schema}.job_i6`
            ]
        },
        {
            release: '12.6.0',
            version: 27,
            previous: 26,
            install: [
                `ALTER TABLE ${schema}.version ADD COLUMN IF NOT EXISTS bam_on timestamp with time zone`,
                `
        CREATE TABLE IF NOT EXISTS ${schema}.bam (
          id uuid PRIMARY KEY default gen_random_uuid(),
          name text NOT NULL,
          version int NOT NULL,
          status text NOT NULL DEFAULT 'pending',
          queue text,
          table_name text NOT NULL,
          command text NOT NULL,
          error text,
          created_on timestamp with time zone NOT NULL DEFAULT now(),
          started_on timestamp with time zone,
          completed_on timestamp with time zone
        )
        `,
                `CREATE FUNCTION ${schema}.job_table_format(command text, table_name text)
          RETURNS text AS
          $$
            SELECT format(
              replace(
                replace(command, '.job', '.%1$I'),
                'job_i', '%1$s_i'
              ),
              table_name
            );
          $$
          LANGUAGE sql;
        `,
                `
        CREATE OR REPLACE FUNCTION ${schema}.job_table_run_async(command_name text, version int, command text, tbl_name text DEFAULT NULL, queue_name text DEFAULT NULL)
        RETURNS VOID AS
        $$
          INSERT INTO ${schema}.bam (name, version, status, queue, table_name, command)
          VALUES (command_name, version, 'pending', NULL, 'job', command)
        $$
        LANGUAGE sql;
        `,
                `ALTER TABLE ${schema}.job ADD COLUMN IF NOT EXISTS group_id text`,
                `ALTER TABLE ${schema}.job ADD COLUMN IF NOT EXISTS group_tier text`,
                `
        CREATE OR REPLACE FUNCTION ${schema}.create_queue(queue_name text, options jsonb)
        RETURNS VOID AS
        $$
          INSERT INTO ${schema}.queue (
            name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
            expire_seconds, retention_seconds, deletion_seconds, warning_queued,
            dead_letter, partition, table_name
          )
          VALUES (
            $1,
            $2->>'policy',
            COALESCE(($2->>'retryLimit')::int, 2),
            COALESCE(($2->>'retryDelay')::int, 0),
            COALESCE(($2->>'retryBackoff')::bool, false),
            ($2->>'retryDelayMax')::int,
            COALESCE(($2->>'expireInSeconds')::int, 900),
            COALESCE(($2->>'retentionSeconds')::int, 1209600),
            COALESCE(($2->>'deleteAfterSeconds')::int, 604800),
            COALESCE(($2->>'warningQueueSize')::int, 0),
            $2->>'deadLetter',
            false,
            'job'
          )
          ON CONFLICT DO NOTHING
        $$
        LANGUAGE sql;
        `
            ],
            async: [
                `SELECT ${schema}.job_table_run_async(
          'group_concurency_index',
          $VERSION$,
          $$
          CREATE INDEX CONCURRENTLY job_i7 ON ${schema}.job (name, group_id) WHERE state = 'active' AND group_id IS NOT NULL
          $$
        )`
            ],
            uninstall: [
                `
        CREATE OR REPLACE FUNCTION ${schema}.create_queue(queue_name text, options jsonb)
        RETURNS VOID AS
        $$
          INSERT INTO ${schema}.queue (
            name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
            expire_seconds, retention_seconds, deletion_seconds, warning_queued,
            dead_letter, partition, table_name
          )
          VALUES (
            $1,
            $2->>'policy',
            COALESCE(($2->>'retryLimit')::int, 2),
            COALESCE(($2->>'retryDelay')::int, 0),
            COALESCE(($2->>'retryBackoff')::bool, false),
            ($2->>'retryDelayMax')::int,
            COALESCE(($2->>'expireInSeconds')::int, 900),
            COALESCE(($2->>'retentionSeconds')::int, 1209600),
            COALESCE(($2->>'deleteAfterSeconds')::int, 604800),
            COALESCE(($2->>'warningQueueSize')::int, 0),
            $2->>'deadLetter',
            false,
            'job'
          )
          ON CONFLICT DO NOTHING
        $$
        LANGUAGE sql;
        `,
                `DROP FUNCTION IF EXISTS ${schema}.job_table_run_async(text, int, text, text, text)`,
                `DROP FUNCTION ${schema}.job_table_format(text, text)`,
                `DROP TABLE ${schema}.bam`,
                `ALTER TABLE ${schema}.version DROP COLUMN bam_on`,
                `ALTER TABLE ${schema}.job DROP COLUMN group_tier`,
                `ALTER TABLE ${schema}.job DROP COLUMN group_id`
            ]
        },
        {
            release: '12.10.0',
            version: 28,
            previous: 27,
            install: [
                `ALTER TABLE ${schema}.job ADD CONSTRAINT job_key_strict_fifo_singleton_key_check CHECK (NOT (policy = 'key_strict_fifo' AND singleton_key IS NULL))`,
                `
        CREATE OR REPLACE FUNCTION ${schema}.create_queue(queue_name text, options jsonb)
        RETURNS VOID AS
        $$
          INSERT INTO ${schema}.queue (
            name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
            expire_seconds, retention_seconds, deletion_seconds, warning_queued,
            dead_letter, partition, table_name
          )
          VALUES (
            $1,
            $2->>'policy',
            COALESCE(($2->>'retryLimit')::int, 2),
            COALESCE(($2->>'retryDelay')::int, 0),
            COALESCE(($2->>'retryBackoff')::bool, false),
            ($2->>'retryDelayMax')::int,
            COALESCE(($2->>'expireInSeconds')::int, 900),
            COALESCE(($2->>'retentionSeconds')::int, 1209600),
            COALESCE(($2->>'deleteAfterSeconds')::int, 604800),
            COALESCE(($2->>'warningQueueSize')::int, 0),
            $2->>'deadLetter',
            false,
            'job'
          )
          ON CONFLICT DO NOTHING
        $$
        LANGUAGE sql;
        `
            ],
            async: [
                `SELECT ${schema}.job_table_run_async(
          'key_strict_fifo_index',
          $VERSION$,
          $$
          CREATE UNIQUE INDEX CONCURRENTLY job_i8 ON ${schema}.job (name, singleton_key) WHERE state IN ('active', 'retry', 'failed') AND policy = 'key_strict_fifo'
          $$
        )`
            ],
            uninstall: [
                `DROP INDEX IF EXISTS ${schema}.job_i8`,
                `ALTER TABLE ${schema}.job DROP CONSTRAINT IF EXISTS job_key_strict_fifo_singleton_key_check`,
                `
        CREATE OR REPLACE FUNCTION ${schema}.create_queue(queue_name text, options jsonb)
        RETURNS VOID AS
        $$
          INSERT INTO ${schema}.queue (
            name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
            expire_seconds, retention_seconds, deletion_seconds, warning_queued,
            dead_letter, partition, table_name
          )
          VALUES (
            $1,
            $2->>'policy',
            COALESCE(($2->>'retryLimit')::int, 2),
            COALESCE(($2->>'retryDelay')::int, 0),
            COALESCE(($2->>'retryBackoff')::bool, false),
            ($2->>'retryDelayMax')::int,
            COALESCE(($2->>'expireInSeconds')::int, 900),
            COALESCE(($2->>'retentionSeconds')::int, 1209600),
            COALESCE(($2->>'deleteAfterSeconds')::int, 604800),
            COALESCE(($2->>'warningQueueSize')::int, 0),
            $2->>'deadLetter',
            false,
            'job'
          )
          ON CONFLICT DO NOTHING
        $$
        LANGUAGE sql;
        `
            ]
        },
        {
            release: '12.11.0',
            version: 29,
            previous: 28,
            install: [
                `CREATE TABLE ${schema}.warning (
          id uuid PRIMARY KEY default gen_random_uuid(),
          type text NOT NULL,
          message text NOT NULL,
          data jsonb,
          created_on timestamp with time zone NOT NULL DEFAULT now()
        )`,
                `CREATE INDEX warning_i1 ON ${schema}.warning (created_on DESC)`
            ],
            uninstall: [
                `DROP INDEX ${schema}.warning_i1`,
                `DROP TABLE ${schema}.warning`
            ]
        },
        {
            release: '12.12.0',
            version: 30,
            previous: 29,
            install: [
                `ALTER TABLE ${schema}.job ADD COLUMN heartbeat_on timestamp with time zone`,
                `ALTER TABLE ${schema}.job ADD COLUMN heartbeat_seconds int`,
                `ALTER TABLE ${schema}.queue ADD COLUMN heartbeat_seconds int`,
                `
        CREATE OR REPLACE FUNCTION ${schema}.create_queue(queue_name text, options jsonb)
        RETURNS VOID AS
        $$
          INSERT INTO ${schema}.queue (
            name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
            expire_seconds, retention_seconds, deletion_seconds, warning_queued,
            dead_letter, partition, table_name, heartbeat_seconds
          )
          VALUES (
            $1,
            $2->>'policy',
            COALESCE(($2->>'retryLimit')::int, 2),
            COALESCE(($2->>'retryDelay')::int, 0),
            COALESCE(($2->>'retryBackoff')::bool, false),
            ($2->>'retryDelayMax')::int,
            COALESCE(($2->>'expireInSeconds')::int, 900),
            COALESCE(($2->>'retentionSeconds')::int, 1209600),
            COALESCE(($2->>'deleteAfterSeconds')::int, 604800),
            COALESCE(($2->>'warningQueueSize')::int, 0),
            $2->>'deadLetter',
            false,
            'job',
            ($2->>'heartbeatSeconds')::int
          )
          ON CONFLICT DO NOTHING
        $$
        LANGUAGE sql;
        `
            ],
            uninstall: [
                `
        CREATE OR REPLACE FUNCTION ${schema}.create_queue(queue_name text, options jsonb)
        RETURNS VOID AS
        $$
          INSERT INTO ${schema}.queue (
            name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
            expire_seconds, retention_seconds, deletion_seconds, warning_queued,
            dead_letter, partition, table_name
          )
          VALUES (
            $1,
            $2->>'policy',
            COALESCE(($2->>'retryLimit')::int, 2),
            COALESCE(($2->>'retryDelay')::int, 0),
            COALESCE(($2->>'retryBackoff')::bool, false),
            ($2->>'retryDelayMax')::int,
            COALESCE(($2->>'expireInSeconds')::int, 900),
            COALESCE(($2->>'retentionSeconds')::int, 1209600),
            COALESCE(($2->>'deleteAfterSeconds')::int, 604800),
            COALESCE(($2->>'warningQueueSize')::int, 0),
            $2->>'deadLetter',
            false,
            'job'
          )
          ON CONFLICT DO NOTHING
        $$
        LANGUAGE sql;
        `,
                `ALTER TABLE ${schema}.queue DROP COLUMN heartbeat_seconds`,
                `ALTER TABLE ${schema}.job DROP COLUMN heartbeat_seconds`,
                `ALTER TABLE ${schema}.job DROP COLUMN heartbeat_on`
            ]
        }
    ];
}
export { rollback, next, migrate, getAll, };
