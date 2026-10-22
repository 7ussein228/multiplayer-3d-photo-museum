import { sql } from "drizzle-orm";
import { db } from "@/db";
import { galleries } from "@/db/schema";

export const dynamic = "force-dynamic";

function describeHost(connectionString: string) {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}:${url.port || 5432}${url.pathname}`;
  } catch {
    return "unparseable";
  }
}

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return Response.json(
      {
        ok: false,
        error: "DATABASE_URL is not set in this environment.",
        hint: "Add DATABASE_URL to the project environment variables and redeploy.",
      },
      { status: 500 },
    );
  }

  try {
    await db.execute(sql`select 1`);
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown database error",
        stage: "connect",
        target: describeHost(databaseUrl),
        hint: "The database was reached but the connection failed. Check the credentials, SSL mode and that the host allows connections from this deployment.",
      },
      { status: 500 },
    );
  }

  try {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(galleries);
    return Response.json({ ok: true, tablesReady: true, galleries: row.count });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown database error",
        stage: "query",
        target: describeHost(databaseUrl),
        hint: "The database is reachable but the tables are missing. Run `npm run db:migrate` against this database.",
      },
      { status: 500 },
    );
  }
}
