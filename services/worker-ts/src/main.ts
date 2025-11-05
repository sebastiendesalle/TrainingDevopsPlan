console.log("WORKER: Hello from TypeScript");
console.log(`WORKER: I see the DB at: ${process.env.DATABASE_URL}`);
console.log(`WORKER: I see the user: ${process.env.GARMIN_USER}`);

const run = () => {
  console.log("WORKER: ...scraping...");
  setTimeout(run, 60000);
};

run();
