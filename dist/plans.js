const DEFAULT_SCHEMA = 'pgboss';
const MIGRATE_RACE_MESSAGE = 'division by zero';
const CREATE_RACE_MESSAGE = 'already exists';
const SINGLE_QUOTE_REGEX = /'/g;
const FIFTEEN_MINUTES = 60 * 15;
const FORTEEN_DAYS = 60 * 60 * 24 * 14;
const SEVEN_DAYS = 60 * 60 * 24 * 7;
const JOB_STATES = Object.freeze({
    created: 'created',
    retry: 'retry',
    active: 'active',
    completed: 'completed',
    cancelled: 'cancelled',
    failed: 'failed'
});
const QUEUE_POLICIES = Object.freeze({
    standard: 'standard',
    short: 'short',
    singleton: 'singleton',
    stately: 'stately',
    exclusive: 'exclusive',
    key_strict_fifo: 'key_strict_fifo'
});
const QUEUE_DEFAULTS = {
    expire_seconds: FIFTEEN_MINUTES,
    retention_seconds: FORTEEN_DAYS,
    deletion_seconds: SEVEN_DAYS,
    retry_limit: 2,
    retry_delay: 0,
    warning_queued: 0,
    retry_backoff: false,
    partition: false
};
const COMMON_JOB_TABLE = 'job';
function create(schema, version, options) {
    const commands = [
        options?.createSchema ? createSchema(schema) : '',
        createEnumJobState(schema),
        createTableVersion(schema),
        createTableQueue(schema),
        createTableSchedule(schema),
        createTableSubscription(schema),
        createTableBam(schema),
        jobTableFormatFunction(schema),
        jobTableRunAsyncFunction(schema),
        createTableJob(schema),
        createQueueForeignKeyJob(schema),
        createQueueForeignKeyJobDeadLetter(schema),
        createIndexJobPolicyShort(schema),
        createIndexJobPolicySingleton(schema),
        createIndexJobPolicyStately(schema),
        createIndexJobPolicyExclusive(schema),
        createIndexJobPolicyKeyStrictFifo(schema),
        createCheckConstraintKeyStrictFifo(schema),
        createIndexJobThrottle(schema),
        createIndexJobFetch(schema),
        createIndexJobGroupConcurrency(schema),
        createTableWarning(schema),
        createIndexWarning(schema),
        insertVersion(schema, version)
    ];
    return locked(schema, commands);
}
function createSchema(schema) {
    return `CREATE SCHEMA IF NOT EXISTS ${schema}`;
}
function createEnumJobState(schema) {
    // ENUM definition order is important
    // base type is numeric and first values are less than last values
    return `
    CREATE TYPE ${schema}.job_state AS ENUM (
      '${JOB_STATES.created}',
      '${JOB_STATES.retry}',
      '${JOB_STATES.active}',
      '${JOB_STATES.completed}',
      '${JOB_STATES.cancelled}',
      '${JOB_STATES.failed}'
    )
  `;
}
function createTableVersion(schema) {
    return `
    CREATE TABLE ${schema}.version (
      version int primary key,
      cron_on timestamp with time zone,
      bam_on timestamp with time zone
    )
  `;
}
function createTableQueue(schema) {
    return `
    CREATE TABLE ${schema}.queue (
      name text NOT NULL,
      policy text NOT NULL,
      retry_limit int NOT NULL,
      retry_delay int NOT NULL,
      retry_backoff bool NOT NULL,
      retry_delay_max int,
      expire_seconds int NOT NULL,
      retention_seconds int NOT NULL,
      deletion_seconds int NOT NULL,
      dead_letter text REFERENCES ${schema}.queue (name) CHECK (dead_letter IS DISTINCT FROM name),
      partition bool NOT NULL,
      table_name text NOT NULL,
      deferred_count int NOT NULL default 0,
      queued_count int NOT NULL default 0,
      warning_queued int NOT NULL default 0,
      active_count int NOT NULL default 0,
      total_count int NOT NULL default 0,
      heartbeat_seconds int,
      singletons_active text[],
      monitor_on timestamp with time zone,
      maintain_on timestamp with time zone,
      created_on timestamp with time zone not null default now(),
      updated_on timestamp with time zone not null default now(),
      PRIMARY KEY (name)
    )
  `;
}
function createTableSchedule(schema) {
    return `
    CREATE TABLE ${schema}.schedule (
      name text REFERENCES ${schema}.queue ON DELETE CASCADE,
      key text not null DEFAULT '',
      cron text not null,
      timezone text,
      data jsonb,
      options jsonb,
      created_on timestamp with time zone not null default now(),
      updated_on timestamp with time zone not null default now(),
      PRIMARY KEY (name, key)
    )
  `;
}
function createTableSubscription(schema) {
    return `
    CREATE TABLE ${schema}.subscription (
      event text not null,
      name text not null REFERENCES ${schema}.queue ON DELETE CASCADE,
      created_on timestamp with time zone not null default now(),
      updated_on timestamp with time zone not null default now(),
      PRIMARY KEY(event, name)
    )
  `;
}
function createTableBam(schema) {
    return `
    CREATE TABLE ${schema}.bam (
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
  `;
}
function createTableWarning(schema) {
    return `
    CREATE TABLE ${schema}.warning (
      id uuid PRIMARY KEY default gen_random_uuid(),
      type text NOT NULL,
      message text NOT NULL,
      data jsonb,
      created_on timestamp with time zone NOT NULL DEFAULT now()
    )
  `;
}
function createIndexWarning(schema) {
    return `CREATE INDEX warning_i1 ON ${schema}.warning (created_on DESC)`;
}
function jobTableFormatFunction(schema) {
    return `
    CREATE FUNCTION ${schema}.job_table_format(command text, table_name text)
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
  `;
}
function jobTableRunAsyncFunction(schema) {
    return `
    CREATE FUNCTION ${schema}.job_table_run_async(command_name text, version int, command text, tbl_name text DEFAULT NULL, queue_name text DEFAULT NULL)
    RETURNS VOID AS
    $$
      INSERT INTO ${schema}.bam (name, version, status, queue, table_name, command)
      VALUES (command_name, version, 'pending', NULL, '${COMMON_JOB_TABLE}', command)
    $$
    LANGUAGE sql;
  `;
}
function createTableJob(schema) {
    return `
    CREATE TABLE ${schema}.job (
      id uuid not null default gen_random_uuid(),
      name text not null,
      priority integer not null default(0),
      data jsonb,
      state ${schema}.job_state not null default '${JOB_STATES.created}',
      retry_limit integer not null default ${QUEUE_DEFAULTS.retry_limit},
      retry_count integer not null default 0,
      retry_delay integer not null default ${QUEUE_DEFAULTS.retry_delay},
      retry_backoff boolean not null default ${QUEUE_DEFAULTS.retry_backoff},
      retry_delay_max integer,
      expire_seconds int not null default ${QUEUE_DEFAULTS.expire_seconds},
      deletion_seconds int not null default ${QUEUE_DEFAULTS.deletion_seconds},
      singleton_key text,
      singleton_on timestamp without time zone,
      group_id text,
      group_tier text,
      start_after timestamp with time zone not null default now(),
      created_on timestamp with time zone not null default now(),
      started_on timestamp with time zone,
      completed_on timestamp with time zone,
      keep_until timestamp with time zone NOT NULL default now() + interval '${QUEUE_DEFAULTS.retention_seconds}',
      output jsonb,
      dead_letter text,
      policy text,
      heartbeat_on timestamp with time zone,
      heartbeat_seconds int,
      PRIMARY KEY (name, id)
    )
  `;
}
const JOB_COLUMNS_MIN = 'id, name, data, expire_seconds as "expireInSeconds", heartbeat_seconds as "heartbeatSeconds", group_id as "groupId", group_tier as "groupTier"';
const JOB_COLUMNS_ALL = `${JOB_COLUMNS_MIN},
  policy,
  state,
  priority,
  retry_limit as "retryLimit",
  retry_count as "retryCount",
  retry_delay as "retryDelay",
  retry_backoff as "retryBackoff",
  retry_delay_max as "retryDelayMax",
  start_after as "startAfter",
  started_on as "startedOn",
  singleton_key as "singletonKey",
  singleton_on as "singletonOn",
  deletion_seconds as "deleteAfterSeconds",
  heartbeat_on as "heartbeatOn",
  created_on as "createdOn",
  completed_on as "completedOn",
  keep_until as "keepUntil",
  dead_letter as "deadLetter",
  output
`;
function createQueue(schema, name, options) {
    const sql = `SELECT ${schema}.create_queue('${name}', '${JSON.stringify(options)}'::jsonb)`;
    return locked(schema, sql, 'create-queue');
}
function deleteQueue(schema, name) {
    const sql = `SELECT ${schema}.delete_queue('${name}')`;
    return locked(schema, sql, 'delete-queue');
}
function createPrimaryKeyJob(schema) {
    return `ALTER TABLE ${schema}.job ADD PRIMARY KEY (name, id)`;
}
function createQueueForeignKeyJob(schema) {
    return `ALTER TABLE ${schema}.job ADD CONSTRAINT q_fkey FOREIGN KEY (name) REFERENCES ${schema}.queue (name) ON DELETE RESTRICT`;
}
function createQueueForeignKeyJobDeadLetter(schema) {
    return `ALTER TABLE ${schema}.job ADD CONSTRAINT dlq_fkey FOREIGN KEY (dead_letter) REFERENCES ${schema}.queue (name) ON DELETE RESTRICT`;
}
function createIndexJobPolicyShort(schema) {
    return `CREATE UNIQUE INDEX job_i1 ON ${schema}.job (name, COALESCE(singleton_key, '')) WHERE state = '${JOB_STATES.created}' AND policy = '${QUEUE_POLICIES.short}'`;
}
function createIndexJobPolicySingleton(schema) {
    return `CREATE UNIQUE INDEX job_i2 ON ${schema}.job (name, COALESCE(singleton_key, '')) WHERE state = '${JOB_STATES.active}' AND policy = '${QUEUE_POLICIES.singleton}'`;
}
function createIndexJobPolicyStately(schema) {
    return `CREATE UNIQUE INDEX job_i3 ON ${schema}.job (name, state, COALESCE(singleton_key, '')) WHERE state <= '${JOB_STATES.active}' AND policy = '${QUEUE_POLICIES.stately}'`;
}
function createIndexJobThrottle(schema) {
    return `CREATE UNIQUE INDEX job_i4 ON ${schema}.job (name, singleton_on, COALESCE(singleton_key, '')) WHERE state <> '${JOB_STATES.cancelled}' AND singleton_on IS NOT NULL`;
}
function createIndexJobFetch(schema) {
    return `CREATE INDEX job_i5 ON ${schema}.job (name, start_after) INCLUDE (priority, created_on) WHERE state < '${JOB_STATES.active}'`;
}
function createIndexJobPolicyExclusive(schema) {
    return `CREATE UNIQUE INDEX job_i6 ON ${schema}.job (name, COALESCE(singleton_key, '')) WHERE state <= '${JOB_STATES.active}' AND policy = '${QUEUE_POLICIES.exclusive}'`;
}
function createIndexJobPolicyKeyStrictFifo(schema) {
    return `CREATE UNIQUE INDEX job_i8 ON ${schema}.job (name, singleton_key) WHERE state IN ('${JOB_STATES.active}', '${JOB_STATES.retry}', '${JOB_STATES.failed}') AND policy = '${QUEUE_POLICIES.key_strict_fifo}'`;
}
function createCheckConstraintKeyStrictFifo(schema) {
    return `ALTER TABLE ${schema}.job ADD CONSTRAINT job_key_strict_fifo_singleton_key_check CHECK (NOT (policy = '${QUEUE_POLICIES.key_strict_fifo}' AND singleton_key IS NULL))`;
}
function createIndexJobGroupConcurrency(schema) {
    return `CREATE INDEX job_i7 ON ${schema}.job (name, group_id) WHERE state = '${JOB_STATES.active}' AND group_id IS NOT NULL`;
}
function trySetQueueMonitorTime(schema, queues, seconds) {
    return trySetQueueTimestamp(schema, queues, 'monitor_on', seconds);
}
function trySetQueueDeletionTime(schema, queues, seconds) {
    return trySetQueueTimestamp(schema, queues, 'maintain_on', seconds);
}
function trySetCronTime(schema, seconds) {
    return trySetTimestamp(schema, 'cron_on', seconds);
}
function trySetBamTime(schema, seconds) {
    return trySetTimestamp(schema, 'bam_on', seconds);
}
function trySetTimestamp(schema, column, seconds) {
    return `
    UPDATE ${schema}.version
    SET ${column} = now()
    WHERE EXTRACT( EPOCH FROM (now() - COALESCE(${column}, now() - interval '1 week') ) ) > ${seconds}
    RETURNING true
  `;
}
function trySetQueueTimestamp(schema, queues, column, seconds) {
    return {
        text: `
    UPDATE ${schema}.queue
    SET ${column} = now()
    WHERE name = ANY($1::text[])
      AND EXTRACT( EPOCH FROM (now() - COALESCE(${column}, now() - interval '1 week') ) ) > ${seconds}
    RETURNING name
  `,
        values: [queues]
    };
}
function updateQueue(schema, { deadLetter } = {}) {
    return `
    WITH options as (SELECT $2::jsonb as data)
    UPDATE ${schema}.queue SET
      retry_limit = COALESCE((o.data->>'retryLimit')::int, retry_limit),
      retry_delay = COALESCE((o.data->>'retryDelay')::int, retry_delay),
      retry_backoff = COALESCE((o.data->>'retryBackoff')::bool, retry_backoff),
      retry_delay_max = CASE WHEN o.data ? 'retryDelayMax'
        THEN (o.data->>'retryDelayMax')::int
        ELSE retry_delay_max END,
      expire_seconds = COALESCE((o.data->>'expireInSeconds')::int, expire_seconds),
      retention_seconds = COALESCE((o.data->>'retentionSeconds')::int, retention_seconds),
      deletion_seconds = COALESCE((o.data->>'deleteAfterSeconds')::int, deletion_seconds),
      warning_queued = COALESCE((o.data->>'warningQueueSize')::int, warning_queued),
      heartbeat_seconds = CASE WHEN o.data ? 'heartbeatSeconds'
        THEN (o.data->>'heartbeatSeconds')::int
        ELSE heartbeat_seconds END,
      ${deadLetter === undefined
        ? ''
        : `dead_letter = CASE WHEN '${deadLetter}' IS DISTINCT FROM dead_letter THEN '${deadLetter}' ELSE dead_letter END,`}
      updated_on = now()
    FROM options o
    WHERE name = $1
  `;
}
function getQueues(schema, names) {
    const hasNames = names && names.length > 0;
    return {
        text: `
    SELECT
      q.name,
      q.policy,
      q.retry_limit as "retryLimit",
      q.retry_delay as "retryDelay",
      q.retry_backoff as "retryBackoff",
      q.retry_delay_max as "retryDelayMax",
      q.expire_seconds as "expireInSeconds",
      q.retention_seconds as "retentionSeconds",
      q.deletion_seconds as "deleteAfterSeconds",
      q.partition,
      q.heartbeat_seconds as "heartbeatSeconds",
      q.dead_letter as "deadLetter",
      q.deferred_count as "deferredCount",
      q.warning_queued as "warningQueueSize",
      q.queued_count as "queuedCount",
      q.active_count as "activeCount",
      q.total_count as "totalCount",
      q.singletons_active as "singletonsActive",
      q.table_name as "table",
      q.created_on as "createdOn",
      q.updated_on as "updatedOn"
    FROM ${schema}.queue q
    ${hasNames ? 'WHERE q.name = ANY($1::text[])' : ''}
   `,
        values: hasNames ? [names] : []
    };
}
function deleteJobsById(schema, table) {
    return `
    WITH results as (
      DELETE FROM ${schema}.${table}
      WHERE name = $1
        AND id IN (SELECT UNNEST($2::uuid[]))
      RETURNING 1
    )
    SELECT COUNT(*) from results
  `;
}
function deleteQueuedJobs(schema, table) {
    return `DELETE from ${schema}.${table} WHERE name = $1 and state < '${JOB_STATES.active}'`;
}
function deleteStoredJobs(schema, table) {
    return `DELETE from ${schema}.${table} WHERE name = $1 and state > '${JOB_STATES.active}'`;
}
function truncateTable(schema, table) {
    return `TRUNCATE ${schema}.${table}`;
}
function deleteAllJobs(schema, table) {
    return `DELETE from ${schema}.${table} WHERE name = $1`;
}
function getSchedules(schema) {
    return `SELECT * FROM ${schema}.schedule ORDER BY name, key`;
}
function getSchedulesByQueue(schema) {
    return `SELECT * FROM ${schema}.schedule WHERE name = $1 AND COALESCE(key, '') = $2`;
}
function schedule(schema) {
    return `
    INSERT INTO ${schema}.schedule (name, key, cron, timezone, data, options)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (name, key) DO UPDATE SET
      cron = EXCLUDED.cron,
      timezone = EXCLUDED.timezone,
      data = EXCLUDED.data,
      options = EXCLUDED.options,
      updated_on = now()
  `;
}
function unschedule(schema) {
    return `
    DELETE FROM ${schema}.schedule
    WHERE name = $1
      AND COALESCE(key, '') = $2
  `;
}
function subscribe(schema) {
    return `
    INSERT INTO ${schema}.subscription (event, name)
    VALUES ($1, $2)
    ON CONFLICT (event, name) DO UPDATE SET
      event = EXCLUDED.event,
      name = EXCLUDED.name,
      updated_on = now()
  `;
}
function unsubscribe(schema) {
    return `
    DELETE FROM ${schema}.subscription
    WHERE event = $1 and name = $2
  `;
}
function getQueuesForEvent(schema) {
    return `
    SELECT name FROM ${schema}.subscription
    WHERE event = $1
  `;
}
function getTime() {
    return "SELECT round(date_part('epoch', now()) * 1000) as time";
}
function insertWarning(schema) {
    return `
    INSERT INTO ${schema}.warning (type, message, data)
    VALUES ($1, $2, $3)
  `;
}
function getWarnings(schema) {
    return `
    SELECT
      id,
      type,
      message,
      data,
      created_on as "createdOn"
    FROM ${schema}.warning
    WHERE ($1::text IS NULL OR type = $1)
    ORDER BY created_on DESC
    LIMIT $2 OFFSET $3
  `;
}
function getWarningsCount(schema) {
    return `
    SELECT COUNT(*)::int as count
    FROM ${schema}.warning
    WHERE ($1::text IS NULL OR type = $1)
  `;
}
function deleteOldWarnings(schema, days) {
    return `
    DELETE FROM ${schema}.warning
    WHERE created_on < now() - interval '${days} days'
  `;
}
function getVersion(schema) {
    return `SELECT version from ${schema}.version`;
}
function setVersion(schema, version) {
    return `UPDATE ${schema}.version SET version = '${version}'`;
}
function versionTableExists(schema) {
    return `SELECT to_regclass('${schema}.version') as name`;
}
function insertVersion(schema, version) {
    return `INSERT INTO ${schema}.version(version) VALUES ('${version}')`;
}
function buildFetchParams(options) {
    const { ignoreSingletons, ignoreGroups, groupConcurrency, minPriority, maxPriority } = options;
    const hasIgnoreSingletons = ignoreSingletons != null && ignoreSingletons.length > 0;
    const hasIgnoreGroups = ignoreGroups != null && ignoreGroups.length > 0;
    const hasGroupConcurrency = groupConcurrency != null;
    const hasMinPriority = minPriority != null;
    const hasMaxPriority = maxPriority != null;
    const groupConcurrencyConfig = hasGroupConcurrency
        ? (typeof groupConcurrency === 'number' ? { default: groupConcurrency } : groupConcurrency)
        : null;
    const hasTiers = groupConcurrencyConfig?.tiers && Object.keys(groupConcurrencyConfig.tiers).length > 0;
    const values = [];
    let paramIndex = 0;
    let ignoreSingletonsParam = '';
    let ignoreGroupsParam = '';
    let defaultGroupLimitParam = '';
    let tiersParam = '';
    let minPriorityParam = '';
    let maxPriorityParam = '';
    if (hasIgnoreSingletons) {
        paramIndex++;
        ignoreSingletonsParam = `$${paramIndex}::text[]`;
        values.push(ignoreSingletons);
    }
    if (hasIgnoreGroups) {
        paramIndex++;
        ignoreGroupsParam = `$${paramIndex}::text[]`;
        values.push(ignoreGroups);
    }
    if (hasGroupConcurrency && groupConcurrencyConfig) {
        paramIndex++;
        defaultGroupLimitParam = `$${paramIndex}::int`;
        values.push(groupConcurrencyConfig.default);
        if (hasTiers) {
            paramIndex++;
            tiersParam = `$${paramIndex}::jsonb`;
            values.push(JSON.stringify(groupConcurrencyConfig.tiers));
        }
    }
    if (hasMinPriority) {
        paramIndex++;
        minPriorityParam = `$${paramIndex}::int`;
        values.push(minPriority);
    }
    if (hasMaxPriority) {
        paramIndex++;
        maxPriorityParam = `$${paramIndex}::int`;
        values.push(maxPriority);
    }
    return { values, ignoreSingletonsParam, ignoreGroupsParam, defaultGroupLimitParam, tiersParam, minPriorityParam, maxPriorityParam };
}
function fetchNextJob(options) {
    const { schema, table, name, policy, limit, includeMetadata, priority = true, orderByCreatedOn = true, ignoreStartAfter = false, groupConcurrency, minPriority, maxPriority } = options;
    const singletonFetch = limit > 1 && (policy === QUEUE_POLICIES.singleton || policy === QUEUE_POLICIES.stately);
    const hasIgnoreSingletons = options.ignoreSingletons != null && options.ignoreSingletons.length > 0;
    const hasIgnoreGroups = options.ignoreGroups != null && options.ignoreGroups.length > 0;
    const hasGroupConcurrency = groupConcurrency != null;
    const hasMinPriority = minPriority != null;
    const hasMaxPriority = maxPriority != null;
    const hasTiers = hasGroupConcurrency &&
        typeof groupConcurrency === 'object' &&
        groupConcurrency.tiers &&
        Object.keys(groupConcurrency.tiers).length > 0;
    const params = buildFetchParams(options);
    const selectCols = [
        'j.id',
        singletonFetch ? 'j.singleton_key' : '',
        hasGroupConcurrency ? 'j.group_id, j.group_tier' : ''
    ].filter(Boolean).join(', ');
    // MATERIALIZED forces Postgres to compute this aggregation once and cache the
    // result. Without it, Postgres 12+ may inline the CTE and re-evaluate the
    // COUNT query at each reference site. active_group_counts is referenced twice:
    // once in the next CTE join (to pre-filter saturated groups before LIMIT) and
    // once in group_ranking (to enforce the per-batch concurrency limit).
    const activeGroupCountsCte = hasGroupConcurrency
        ? `active_group_counts AS MATERIALIZED (
        SELECT group_id, COUNT(*)::int as active_cnt
        FROM ${schema}.${table}
        WHERE name = '${name}' AND state = '${JOB_STATES.active}' AND group_id IS NOT NULL
        GROUP BY group_id
      ), `
        : '';
    // Column references are qualified with j. throughout so both the base case and
    // the groupConcurrency branch (which joins active_group_counts) share one set of
    // expressions. The join introduces agc.group_id which would otherwise be ambiguous.
    const whereConditions = [
        `j.name = '${name}'`,
        `j.state < '${JOB_STATES.active}'`,
        !ignoreStartAfter ? 'j.start_after < now()' : '',
        hasIgnoreSingletons ? `j.singleton_key <> ALL(${params.ignoreSingletonsParam})` : '',
        hasIgnoreGroups ? `(j.group_id IS NULL OR j.group_id <> ALL(${params.ignoreGroupsParam}))` : '',
        hasMinPriority ? `j.priority >= ${params.minPriorityParam}` : '',
        hasMaxPriority ? `j.priority <= ${params.maxPriorityParam}` : '',
        hasGroupConcurrency
            ? `(j.group_id IS NULL
            OR agc.active_cnt IS NULL
            OR agc.active_cnt < ${hasTiers
                ? `COALESCE((${params.tiersParam} ->> j.group_tier)::int, ${params.defaultGroupLimitParam})`
                : params.defaultGroupLimitParam})`
            : ''
    ].filter(Boolean).join('\n          AND ');
    const nextCte = `
      next AS (
        SELECT ${selectCols}
        FROM ${schema}.${table} j
        ${hasGroupConcurrency ? 'LEFT JOIN active_group_counts agc ON j.group_id = agc.group_id' : ''}
        WHERE ${whereConditions}
        ORDER BY ${priority ? 'j.priority desc, ' : ''}${orderByCreatedOn ? 'j.created_on, ' : ''}j.id
        LIMIT ${limit}
        FOR UPDATE OF j SKIP LOCKED
      )`;
    const singletonCte = singletonFetch
        ? `, singleton_ranking AS (
        SELECT id, ${hasGroupConcurrency ? 'group_id, group_tier, ' : ''}
          row_number() OVER (PARTITION BY singleton_key) as singleton_rn
        FROM next
      )`
        : '';
    const groupConcurrencyCtes = hasGroupConcurrency
        ? `,
      group_ranking AS (
        SELECT t.id
          , t.group_id
          , t.group_tier
          ${singletonFetch ? ', singleton_rn' : ''}
          , ROW_NUMBER() OVER (PARTITION BY t.group_id ORDER BY t.id) as group_rn
          , COALESCE(agc.active_cnt, 0) as active_cnt
        FROM ${singletonFetch ? 'singleton_ranking' : 'next'} t
        LEFT JOIN active_group_counts agc ON t.group_id = agc.group_id
        ${singletonFetch ? 'WHERE singleton_rn = 1' : ''}
      ),
      group_filtered AS (
        SELECT id FROM group_ranking
        WHERE group_id IS NULL
          OR (active_cnt + group_rn) <= ${hasTiers
            ? `COALESCE((${params.tiersParam} ->> group_tier)::int, ${params.defaultGroupLimitParam})`
            : params.defaultGroupLimitParam}
      )`
        : '';
    const finalCte = (hasGroupConcurrency)
        ? 'group_filtered'
        : (singletonFetch)
            ? 'singleton_ranking'
            : 'next';
    return {
        text: `
      WITH
      ${activeGroupCountsCte}
      ${nextCte}
      ${singletonCte}
      ${groupConcurrencyCtes}
      UPDATE ${schema}.${table} j SET
        state = '${JOB_STATES.active}',
        started_on = now(),
        heartbeat_on = now(),
        retry_count = CASE WHEN started_on IS NOT NULL THEN retry_count + 1 ELSE retry_count END
      FROM ${finalCte}
      WHERE name = '${name}' AND j.id = ${finalCte}.id
      ${singletonFetch && !hasGroupConcurrency ? 'AND singleton_rn = 1' : ''}
      RETURNING j.${includeMetadata ? JOB_COLUMNS_ALL : JOB_COLUMNS_MIN}
    `,
        values: params.values
    };
}
function completeJobs(schema, table, includeQueued) {
    const stateFilter = includeQueued
        ? `state < '${JOB_STATES.completed}'`
        : `state = '${JOB_STATES.active}'`;
    return `
    WITH results AS (
      UPDATE ${schema}.${table}
      SET completed_on = now(),
        state = '${JOB_STATES.completed}',
        output = $3::jsonb
      WHERE name = $1
        AND id IN (SELECT UNNEST($2::uuid[]))
        AND ${stateFilter}
      RETURNING *
    )
    SELECT COUNT(*) FROM results
  `;
}
function cancelJobs(schema, table) {
    return `
    WITH results as (
      UPDATE ${schema}.${table}
      SET completed_on = now(),
        state = '${JOB_STATES.cancelled}'
      WHERE name = $1
        AND id IN (SELECT UNNEST($2::uuid[]))
        AND state < '${JOB_STATES.completed}'
      RETURNING 1
    )
    SELECT COUNT(*) from results
  `;
}
function resumeJobs(schema, table) {
    return `
    WITH results as (
      UPDATE ${schema}.${table}
      SET completed_on = NULL,
        state = '${JOB_STATES.created}'
      WHERE name = $1
        AND id IN (SELECT UNNEST($2::uuid[]))
        AND state = '${JOB_STATES.cancelled}'
      RETURNING 1
    )
    SELECT COUNT(*) from results
  `;
}
function restoreJobs(schema, table) {
    return `
    UPDATE ${schema}.${table}
    SET state = '${JOB_STATES.created}',
        started_on = NULL,
        heartbeat_on = NULL
    WHERE name = $1
      AND id IN (SELECT UNNEST($2::uuid[]))
  `;
}
function insertJobs(schema, { table, name, returnId = true }) {
    const sql = `
    INSERT INTO ${schema}.${table} (
      id,
      name,
      data,
      priority,
      start_after,
      singleton_key,
      singleton_on,
      group_id,
      group_tier,
      expire_seconds,
      deletion_seconds,
      keep_until,
      retry_limit,
      retry_delay,
      retry_backoff,
      retry_delay_max,
      policy,
      dead_letter,
      heartbeat_seconds
    )
    SELECT
      COALESCE(id, gen_random_uuid()) as id,
      '${name}' as name,
      data,
      COALESCE(priority, 0) as priority,
      j.start_after,
      "singletonKey",
      CASE
        WHEN "singletonSeconds" IS NOT NULL THEN 'epoch'::timestamp + '1s'::interval * ("singletonSeconds" * floor(( date_part('epoch', now()) + COALESCE("singletonOffset",0)) / "singletonSeconds" ))
        ELSE NULL
        END as singleton_on,
      "groupId" as group_id,
      "groupTier" as group_tier,
      COALESCE("expireInSeconds", q.expire_seconds) as expire_seconds,
      COALESCE("deleteAfterSeconds", q.deletion_seconds) as deletion_seconds,
      j.start_after + (COALESCE("retentionSeconds", q.retention_seconds) * interval '1s') as keep_until,
      COALESCE("retryLimit", q.retry_limit) as retry_limit,
      COALESCE("retryDelay", q.retry_delay) as retry_delay,
      COALESCE("retryBackoff", q.retry_backoff, false) as retry_backoff,
      COALESCE("retryDelayMax", q.retry_delay_max) as retry_delay_max,
      q.policy,
      COALESCE("deadLetter", q.dead_letter) as dead_letter,
      COALESCE("heartbeatSeconds", q.heartbeat_seconds) as heartbeat_seconds
    FROM (
      SELECT
        (x->>'id')::uuid as id,
        (x->>'priority')::integer as priority,
        (x->>'data')::jsonb as data,
        x->>'startAfter' as "startAfter",
        (x->>'retryLimit')::integer as "retryLimit",
        (x->>'retryDelay')::integer as "retryDelay",
        (x->>'retryDelayMax')::integer as "retryDelayMax",
        (x->>'retryBackoff')::boolean as "retryBackoff",
        x->>'singletonKey' as "singletonKey",
        (x->>'singletonSeconds')::integer as "singletonSeconds",
        (x->>'singletonOffset')::integer as "singletonOffset",
        x->>'groupId' as "groupId",
        x->>'groupTier' as "groupTier",
        (x->>'expireInSeconds')::integer as "expireInSeconds",
        (x->>'deleteAfterSeconds')::integer as "deleteAfterSeconds",
        (x->>'retentionSeconds')::integer as "retentionSeconds",
        x->>'deadLetter' as "deadLetter",
        (x->>'heartbeatSeconds')::integer as "heartbeatSeconds",
        CASE
          WHEN right(x->>'startAfter', 1) = 'Z' THEN CAST(x->>'startAfter' as timestamp with time zone)
          ELSE now() + CAST(COALESCE(x->>'startAfter','0') as interval)
          END as start_after
      FROM jsonb_array_elements($1::jsonb) AS x
    ) j
    JOIN ${schema}.queue q ON q.name = '${name}'
    ON CONFLICT DO NOTHING
    ${returnId ? 'RETURNING id' : ''}
  `;
    return sql;
}
function failJobsById(schema, table) {
    const where = `name = $1 AND id IN (SELECT UNNEST($2::uuid[])) AND state < '${JOB_STATES.completed}'`;
    const output = '$3::jsonb';
    return failJobs(schema, table, where, output);
}
function failJobsByTimeout(schema, table, queues) {
    const where = `state = '${JOB_STATES.active}'
            AND (started_on + expire_seconds * interval '1s') < now()
            AND name = ANY(${serializeArrayParam(queues)})`;
    const output = '\'{ "value": { "message": "job timed out" } }\'::jsonb';
    return locked(schema, failJobs(schema, table, where, output), table + 'failJobsByTimeout');
}
function failJobsByHeartbeat(schema, table, queues) {
    const where = `state = '${JOB_STATES.active}'
            AND heartbeat_seconds IS NOT NULL
            AND (heartbeat_on + heartbeat_seconds * interval '1s') < now()
            AND name = ANY(${serializeArrayParam(queues)})`;
    const output = '\'{ "value": { "message": "job heartbeat timeout" } }\'::jsonb';
    return locked(schema, failJobs(schema, table, where, output), table + 'failJobsByHeartbeat');
}
function touchJobs(schema, table) {
    return `
    WITH results AS (
      UPDATE ${schema}.${table}
      SET heartbeat_on = now()
      WHERE name = $1
        AND id IN (SELECT UNNEST($2::uuid[]))
        AND state = '${JOB_STATES.active}'
      RETURNING 1
    )
    SELECT COUNT(*) FROM results
  `;
}
function failJobs(schema, table, where, output) {
    return `
    WITH deleted_jobs AS (
      DELETE FROM ${schema}.${table}
      WHERE ${where}
      RETURNING *
    ),
    retried_jobs AS (
      INSERT INTO ${schema}.${table} (
        id,
        name,
        priority,
        data,
        state,
        retry_limit,
        retry_count,
        retry_delay,
        retry_backoff,
        retry_delay_max,
        start_after,
        started_on,
        singleton_key,
        singleton_on,
        group_id,
        group_tier,
        expire_seconds,
        deletion_seconds,
        created_on,
        completed_on,
        keep_until,
        policy,
        output,
        dead_letter,
        heartbeat_on,
        heartbeat_seconds
      )
      SELECT
        id,
        name,
        priority,
        data,
        CASE
          WHEN retry_count < retry_limit THEN '${JOB_STATES.retry}'::${schema}.job_state
          ELSE '${JOB_STATES.failed}'::${schema}.job_state
          END as state,
        retry_limit,
        retry_count,
        retry_delay,
        retry_backoff,
        retry_delay_max,
        CASE WHEN retry_count = retry_limit THEN start_after
             WHEN NOT retry_backoff THEN now() + retry_delay * interval '1'
             ELSE now() + LEAST(
               retry_delay_max,
               retry_delay * (
                2 ^ LEAST(16, retry_count + 1) / 2 +
                2 ^ LEAST(16, retry_count + 1) / 2 * random()
               )
             ) * interval '1s'
        END as start_after,
        started_on,
        singleton_key,
        singleton_on,
        group_id,
        group_tier,
        expire_seconds,
        deletion_seconds,
        created_on,
        CASE WHEN retry_count < retry_limit THEN NULL ELSE now() END as completed_on,
        keep_until,
        policy,
        ${output},
        dead_letter,
        NULL as heartbeat_on,
        heartbeat_seconds
      FROM deleted_jobs
      ON CONFLICT DO NOTHING
      RETURNING *
    ),
    failed_jobs as (
      INSERT INTO ${schema}.${table} (
        id,
        name,
        priority,
        data,
        state,
        retry_limit,
        retry_count,
        retry_delay,
        retry_backoff,
        retry_delay_max,
        start_after,
        started_on,
        singleton_key,
        singleton_on,
        group_id,
        group_tier,
        expire_seconds,
        deletion_seconds,
        created_on,
        completed_on,
        keep_until,
        policy,
        output,
        dead_letter,
        heartbeat_on,
        heartbeat_seconds
      )
      SELECT
        id,
        name,
        priority,
        data,
        '${JOB_STATES.failed}'::${schema}.job_state as state,
        retry_limit,
        retry_count,
        retry_delay,
        retry_backoff,
        retry_delay_max,
        start_after,
        started_on,
        singleton_key,
        singleton_on,
        group_id,
        group_tier,
        expire_seconds,
        deletion_seconds,
        created_on,
        now() as completed_on,
        keep_until,
        policy,
        ${output},
        dead_letter,
        NULL as heartbeat_on,
        heartbeat_seconds
      FROM deleted_jobs
      WHERE id NOT IN (SELECT id from retried_jobs)
      RETURNING *
    ),
    results as (
      SELECT * FROM retried_jobs
      UNION ALL
      SELECT * FROM failed_jobs
    ),
    dlq_jobs as (
      INSERT INTO ${schema}.job (name, data, output, retry_limit, retry_backoff, retry_delay, keep_until, deletion_seconds)
      SELECT
        r.dead_letter,
        data,
        output,
        q.retry_limit,
        q.retry_backoff,
        q.retry_delay,
        now() + q.retention_seconds * interval '1s',
        q.deletion_seconds
      FROM results r
        JOIN ${schema}.queue q ON q.name = r.dead_letter
      WHERE state = '${JOB_STATES.failed}'
    )
    SELECT COUNT(*) FROM results
  `;
}
function deletion(schema, table, queues) {
    const sql = `
    DELETE FROM ${schema}.${table}
    WHERE name = ANY(${serializeArrayParam(queues)})
      AND
      (
        (deletion_seconds > 0 AND completed_on + deletion_seconds * interval '1s' < now())
        OR
        (state < '${JOB_STATES.active}' AND keep_until < now())
      )
  `;
    return locked(schema, sql, table + 'deletion');
}
function retryJobs(schema, table) {
    return `
    WITH results as (
      UPDATE ${schema}.job
      SET state = '${JOB_STATES.retry}',
        retry_limit = retry_limit + 1
      WHERE name = $1
        AND id IN (SELECT UNNEST($2::uuid[]))
        AND state = '${JOB_STATES.failed}'
      RETURNING 1
    )
    SELECT COUNT(*) from results
  `;
}
function getQueueStats(schema, table, queues) {
    return {
        text: `
    SELECT
        name,
        (count(*) FILTER (WHERE start_after > now()))::int as "deferredCount",
        (count(*) FILTER (WHERE state < '${JOB_STATES.active}'))::int as "queuedCount",
        (count(*) FILTER (WHERE state = '${JOB_STATES.active}'))::int as "activeCount",
        count(*)::int as "totalCount",
        array_agg(singleton_key) FILTER (WHERE policy IN ('${QUEUE_POLICIES.singleton}','${QUEUE_POLICIES.stately}') AND state = '${JOB_STATES.active}') as "singletonsActive"
      FROM ${schema}.${table}
      WHERE name = ANY($1::text[])
      GROUP BY 1
  `,
        values: [queues]
    };
}
function cacheQueueStats(schema, table, queues) {
    const statsQuery = getQueueStats(schema, table, queues);
    // Serialize the $1 parameter for use in locked() multi-statement query
    const statsText = statsQuery.text.replace('$1::text[]', serializeArrayParam(queues));
    const sql = `
    WITH stats AS (${statsText})
    UPDATE ${schema}.queue SET
      deferred_count = COALESCE(stats."deferredCount", 0),
      queued_count = COALESCE(stats."queuedCount", 0),
      active_count = COALESCE(stats."activeCount", 0),
      total_count = COALESCE(stats."totalCount", 0),
      singletons_active = stats."singletonsActive"
    FROM (
      SELECT q.name
      FROM unnest(${serializeArrayParam(queues)}) AS q(name)
    ) q
    LEFT JOIN stats ON stats.name = q.name
    WHERE queue.name = q.name
    RETURNING
      queue.name,
      queue.queued_count as "queuedCount",
      queue.warning_queued as "warningQueueSize"
  `;
    return locked(schema, sql, 'queue-stats');
}
// Serialize a string array for embedding directly in SQL as PostgreSQL array literal
function serializeArrayParam(values) {
    const escaped = values.map(v => `'${v.replace(SINGLE_QUOTE_REGEX, "''")}'`);
    return `ARRAY[${escaped.join(',')}]::text[]`;
}
function locked(schema, query, key) {
    const sql = Array.isArray(query) ? query.join(';\n') : query;
    return `
    BEGIN;
    ${sql};
    COMMIT;
  `;
}
function assertMigration(schema, version) {
    // raises 'division by zero' if already on desired schema version
    return `SELECT version::int/(version::int-${version}) from ${schema}.version`;
}
function findJobs(schema, table, options) {
    const { queued, byKey, byData, byId } = options;
    let paramIndex = 1;
    const whereConditions = [];
    if (byId) {
        ++paramIndex;
        whereConditions.push(`AND id = $${paramIndex}`);
    }
    if (byKey) {
        ++paramIndex;
        whereConditions.push(`AND singleton_key = $${paramIndex}`);
    }
    if (byData) {
        ++paramIndex;
        whereConditions.push(`AND data @> $${paramIndex}`);
    }
    if (queued) {
        whereConditions.push(`AND state < '${JOB_STATES.active}'`);
    }
    return `
    SELECT ${JOB_COLUMNS_ALL}
    FROM ${schema}.${table}
    WHERE name = $1
      ${whereConditions.join('\n      ')}
    `;
}
function getJobById(schema, table) {
    return `
    SELECT ${JOB_COLUMNS_ALL}
    FROM ${schema}.${table}
    WHERE name = $1
      AND id = $2
    `;
}
function getBlockedKeys(schema, table) {
    return `
    SELECT DISTINCT singleton_key as "singletonKey"
    FROM ${schema}.${table}
    WHERE name = $1
      AND state = '${JOB_STATES.failed}'
      AND policy = '${QUEUE_POLICIES.key_strict_fifo}'
    `;
}
function getNextBamCommand(schema) {
    return `
    UPDATE ${schema}.bam
    SET status = 'in_progress', started_on = now()
    WHERE id = (
      SELECT id FROM ${schema}.bam
      WHERE status IN ('pending', 'failed')
        AND NOT EXISTS (SELECT 1 FROM ${schema}.bam WHERE status = 'in_progress')
      ORDER BY created_on
      LIMIT 1
    )
    RETURNING id, name, version, status, queue, table_name as "table", command, error,
              created_on as "createdOn", started_on as "startedOn", completed_on as "completedOn"
  `;
}
function setBamCompleted(schema, id) {
    return `
    UPDATE ${schema}.bam
    SET status = 'completed', completed_on = now()
    WHERE id = '${id}'
  `;
}
function setBamFailed(schema, id, error) {
    const escapedError = error.replace(/'/g, "''");
    return `
    UPDATE ${schema}.bam
    SET status = 'failed', error = '${escapedError}', completed_on = now()
    WHERE id = '${id}'
  `;
}
function getBamStatus(schema) {
    return `
    SELECT status, count(*)::int as count, max(created_on) as "lastCreatedOn"
    FROM ${schema}.bam
    GROUP BY status
  `;
}
function getBamEntries(schema) {
    return `
    SELECT id, name, version, status, queue, table_name as "table", command, error,
           created_on as "createdOn", started_on as "startedOn", completed_on as "completedOn"
    FROM ${schema}.bam
    ORDER BY version, created_on
  `;
}
export { create, insertVersion, getVersion, setVersion, versionTableExists, fetchNextJob, completeJobs, cancelJobs, resumeJobs, restoreJobs, retryJobs, findJobs, deleteJobsById, deleteAllJobs, deleteQueuedJobs, deleteStoredJobs, truncateTable, failJobsById, failJobsByTimeout, failJobsByHeartbeat, touchJobs, insertJobs, getTime, getSchedules, getSchedulesByQueue, schedule, unschedule, subscribe, unsubscribe, getQueuesForEvent, deletion, cacheQueueStats, updateQueue, createQueue, deleteQueue, getQueues, getQueueStats, trySetQueueMonitorTime, trySetQueueDeletionTime, trySetCronTime, trySetBamTime, locked, assertMigration, getJobById, insertWarning, getWarnings, getWarningsCount, deleteOldWarnings, createTableWarning, createIndexWarning, getBlockedKeys, getNextBamCommand, setBamCompleted, setBamFailed, getBamStatus, getBamEntries, serializeArrayParam, QUEUE_POLICIES, JOB_STATES, MIGRATE_RACE_MESSAGE, CREATE_RACE_MESSAGE, DEFAULT_SCHEMA, };
