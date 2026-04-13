import { GarminConnect } from "garmin-connect";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMfaLogin() {
  const username = process.env.GARMIN_USER!;
  const password = process.env.GARMIN_PASS!;

  console.log(`--- Starting interactive Garmin login for ${username} ---`);
  const GC = new GarminConnect({ username, password });

  try {
    console.log("Logging in... Check your email/phone for the Garmin code!");
    // The library will automatically pause here and prompt you in the console for the MFA code
    await GC.login();
    
    console.log("Login successful! Saving tokens to the database...");
    
    const client = await pool.connect();
    try {
      await client.query(`
        INSERT INTO garmin_auth (id, oauth1, oauth2)
        VALUES (1, $1, $2)
        ON CONFLICT (id) DO UPDATE SET
          oauth1 = EXCLUDED.oauth1,
          oauth2 = EXCLUDED.oauth2;
      `, [GC.client.oauth1Token, GC.client.oauth2Token]);
      console.log("Tokens securely saved! You can now start the background worker.");
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("Login failed:", err.message || err);
  } finally {
    process.exit(0);
  }
}

runMfaLogin();