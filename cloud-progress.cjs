const { Pool } = require("pg");

function createPostgresProgress(connectionString) {
  const pool = new Pool({
    connectionString, max: 5, connectionTimeoutMillis: 8000, idleTimeoutMillis: 10000,
  });
  pool.on("error", error => console.error("PostgreSQL idle connection:", error.code ?? error.name));
  const initialize = async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(17324001)");
      await client.query(`
        CREATE TABLE IF NOT EXISTS jlpt_mock_attempts (
          guest_id TEXT NOT NULL,
          attempt_key TEXT NOT NULL,
          record JSONB NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          PRIMARY KEY (guest_id, attempt_key)
        )
      `);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
  let ready;

  async function open(guestId) {
    ready ??= initialize().catch(error => {
      ready = undefined;
      throw error;
    });
    await ready;

    const {rows} = await pool.query(
      "SELECT attempt_key, record, revision FROM jlpt_mock_attempts WHERE guest_id = $1", [guestId]);
    const records = Object.fromEntries(rows.map(row => [row.attempt_key, row.record]));
    const revisions = new Map(rows.map(row => [row.attempt_key, row.revision]));
    async function save(key, record) {
      const revision = revisions.get(key);
      const parameters = [guestId, key, JSON.stringify(record)];
      const result = revision === undefined
        ? await pool.query(`INSERT INTO jlpt_mock_attempts (guest_id, attempt_key, record)
              VALUES ($1, $2, $3::jsonb) ON CONFLICT (guest_id, attempt_key) DO NOTHING RETURNING revision`, parameters)
        : await pool.query(`UPDATE jlpt_mock_attempts SET record = $3::jsonb, revision = revision + 1
              WHERE guest_id = $1 AND attempt_key = $2 AND revision = $4 RETURNING revision`, [...parameters, revision]);
      if (!result.rowCount) {
        const error = new Error("Another request changed this attempt");
        error.code = "JLPT_CONFLICT";
        throw error;
      }
      revisions.set(key, result.rows[0].revision);
    }

    return {records, save};
  }

  return {open};
}

module.exports = {createPostgresProgress};
