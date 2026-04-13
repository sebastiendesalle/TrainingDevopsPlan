import { GarminConnect } from "garmin-connect";
import { Pool } from "pg";

//database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

//function to create database
async function setupDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id BIGINT PRIMARY KEY,
        type VARCHAR(100),
        start_time VARCHAR(100),
        distance_km FLOAT,
        duration_sec FLOAT,
        avg_hr INT,
        avg_speed FLOAT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS garmin_auth (
      id INT PRIMARY KEY,
      oauth1 JSONB,
      oauth2 JSONB
      )`
    );
    console.log('WORKER: "activities" table is ready.');
  } catch (err) {
    console.error("WORKER: Error creating database table:", err);
  } finally {
    client.release();
  }
}

async function getSavedTokens() {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT oauth1, oauth2 FROM garmin_auth WHERE id = 1');
    if (res.rows.length > 0) {
      return {oauth1: res.rows[0].oauth1, oauth2: res.rows[0].oauth2};
    }
    return null;
  } finally {
    client.release();
  }
}

async function saveTokens(oauth1: any, oauth2: any) {
  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO garmin_auth (id, oauth1, oauth2)
      VALUES (1, $1, $2)
      ON CONFLICT (id) DO UPDATE SET
        oauth1 = EXCLUDED.oauth1,
        oauth2 = EXCLUDED.oauth2;
        `, [oauth1, oauth2])
  } finally {
    client.release();
  }
}

async function clearTokens() {
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM garmin_auth WHERE id = 1`);
  } finally {
    client.release();
  }
}

//main worker function
async function fetchGarminActivities() {
  //get garmin credentials from .env
  const username = process.env.GARMIN_USER;
  const password = process.env.GARMIN_PASS;

  if (!username || !password) {
    console.error("WORKER: Garmin username or password not set in .env file!");
    return;
  }

  //garmin login
  const GC = new GarminConnect();

  try {
    const savedTokens = await getSavedTokens();

    if (savedTokens && savedTokens.oauth1 && savedTokens.oauth2) {
      console.log("WORKER: Found saved session tokens. Loading them...");
      GC.client.oauth1Token = savedTokens.oauth1;
      GC.client.oauth2Token = savedTokens.oauth2;
    } else {
      console.log(`WORKER: No tokens found. Logging in to Garmin as ${username}...`);
      await GC.login(username, password);
      console.log("WORKER: Garmin login successful!");

      console.log("WORKER: Saving new session tokens...");
      await saveTokens(GC.client.oauth1Token, GC.client.oauth2Token);
    }

    console.log("WORKER: Fetching recent activities...");
    const activityList = await GC.getActivities(0,1000);

    if (!activityList || activityList.length === 0) {
      console.log("WORKER: No new activities found.");
      return;
    }
    console.log(`WORKER: Found ${activityList.length} recent activities.`);

    const client = await pool.connect();
    try {
      console.log("WORKER: Saving activities to database...");
      for (const activity of activityList) {
        await client.query(`
          INSERT INTO activities (id, type, start_time, distance_km, duration_sec, avg_hr, avg_speed)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            duration_sec = EXCLUDED.duration_sec,
            avg_hr = EXCLUDED.avg_hr,
            avg_speed = EXCLUDED.avg_speed;`,
          [activity.activityId,
            activity.activityType?.typeKey || 'unknown',
            activity.startTimeLocal,
            (activity.distance / 1000).toFixed(2),
            activity.duration,
            activity.averageHR,
            activity.averageSpeed
          ]
        );
      }
      console.log("WORKER: Successfully saved activities.");
    } catch (err) {
      console.log("WORKER: Error saving to database: ", err);
    } finally {
      client.release();
    }
} catch (err: any) {
  console.error("WORKER: Error during Garmin fetch cycle: ", err.message || err)

  const errorString = String(err);
  if (errorString.includes('401') || errorString.includes('403') || err.response?.status === 401) {
    console.warn("WORKER: Unauthorized error! Tokens are likely expired. Clearing tokens from DB.");
    await clearTokens();
  }
}
}

//start for worker
async function startWorker() {
  console.log("--- WORKER PROCESS STARTED ---");

  //start database
  await setupDatabase();

  const runLoop = async () => {
    console.log("--- WORKER: Starting Garmin fetch cycle ---");
    await fetchGarminActivities();

    console.log(
      "--- WORKER: Fetch cycle complete. Sleeping for 4 hours. ---"
    );
    setTimeout(runLoop, 14400000);
  };
  runLoop();

  console.log("--- WORKER PROCESS FINISHED (will exit and restart) ---");
}

// Run the worker
startWorker();
