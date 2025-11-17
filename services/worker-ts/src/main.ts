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
        distance_km FLOAT
      );
    `);
    console.log('WORKER: "activities" table is ready.');
  } catch (err) {
    console.error("WORKER: Error creating database table:", err);
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
  const GC = new GarminConnect({
    username: username,
    password: password,
  });

  try {
    console.log(`WORKER: Logging in to Garmin as ${username}...`);
    // Call login() without arguments, since we already passed the credentials
    await GC.login();
    console.log("WORKER: Garmin login successful!");

    //Fetch activities from activity list
    const activityList = await GC.getActivities(0, 100);
    if (!activityList || activityList.length === 0) {
      console.log("WORKER: No new activities found.");
      return;
    }
    console.log(`WORKER: Found ${activityList.length} recent activities.`);

    //save to databese
    const client = await pool.connect();
    try {
      console.log("WORKER: Saving activities to database...");
      for (const activity of activityList) {
        await client.query(
          `INSERT INTO activities (id, type, start_time, distance_km)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [
            activity.activityId,
            activity.activityType.typeKey,
            activity.startTimeLocal,
            (activity.distance / 1000).toFixed(2),
          ]
        );
      }
      console.log("WORKER: Successfully saved activities.");
    } catch (err) {
      console.error("WORKER: Error saving to database:", err);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("WORKER: Error during Garmin login or fetch:", err);
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
      "--- WORKER: Fetch cycle complete. Sleeping for 30 minutes. ---"
    );
    setTimeout(runLoop, 1800);
  };
  runLoop();

  console.log("--- WORKER PROCESS FINISHED (will exit and restart) ---");
}

// Run the worker
startWorker();
