// Runs once when the Next.js server starts. The push scheduler needs Node.js
// (web-push, SQLite); the import sits inside this exact check so the bundler
// leaves it out of the edge build, which cannot load it.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
