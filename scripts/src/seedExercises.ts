import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, pool, exercisesTable } from "@workspace/db";

type SeedExercise = {
  slug: string;
  name: string;
  trackingType: string;
  category: string;
  equipment: string | null;
  primaryMuscle: string | null;
  targetMuscles: string[];
  force: string | null;
  mechanic: string | null;
  level: string | null;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "data", "exercises.seed.json");

async function main() {
  const raw = readFileSync(dataPath, "utf8");
  const exercises = JSON.parse(raw) as SeedExercise[];

  console.log(`Seeding ${exercises.length} system exercises...`);

  const rows = exercises.map((e) => ({
    userId: null,
    slug: e.slug,
    name: e.name,
    trackingType: e.trackingType,
    category: e.category,
    equipment: e.equipment,
    primaryMuscle: e.primaryMuscle,
    targetMuscles: e.targetMuscles,
    force: e.force,
    mechanic: e.mechanic,
    level: e.level,
    isSystem: true,
  }));

  const CHUNK = 200;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await db
      .insert(exercisesTable)
      .values(chunk)
      .onConflictDoUpdate({
        target: exercisesTable.slug,
        set: {
          name: sql`excluded.name`,
          trackingType: sql`excluded.tracking_type`,
          category: sql`excluded.category`,
          equipment: sql`excluded.equipment`,
          primaryMuscle: sql`excluded.primary_muscle`,
          targetMuscles: sql`excluded.target_muscles`,
          force: sql`excluded.force`,
          mechanic: sql`excluded.mechanic`,
          level: sql`excluded.level`,
          isSystem: sql`excluded.is_system`,
          updatedAt: sql`now()`,
        },
      });
    upserted += chunk.length;
    console.log(`  upserted ${upserted}/${rows.length}`);
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(exercisesTable)
    .where(sql`${exercisesTable.isSystem} = true`);

  console.log(`Done. System exercise count in DB: ${count}`);
  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
