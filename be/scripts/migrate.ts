// TypeORM 마이그레이션을 ESM 환경에서 직접 실행하는 러너입니다.
import { dataSource } from "../src/config/data-source.js";

const command = process.argv[2] ?? "run";

async function main() {
  await dataSource.initialize();
  if (command === "run") {
    const applied = await dataSource.runMigrations({ transaction: "all" });
    console.log(`migrations applied: ${applied.length}`);
    for (const m of applied) console.log(`  - ${m.name}`);
  } else if (command === "revert") {
    if (process.env.ALLOW_DB_REVERT !== "1") {
      console.error(
        "마이그레이션 되돌리기(revert)는 스키마를 되돌리며 데이터 손실·불일치를 일으킬 수 있습니다. " +
          "의도한 경우에만 ALLOW_DB_REVERT=1 을 붙여 실행하세요. " +
          "예: ALLOW_DB_REVERT=1 pnpm --filter be db:revert",
      );
      process.exit(1);
    }
    await dataSource.undoLastMigration({ transaction: "all" });
    console.log("last migration reverted");
  } else {
    throw new Error(`unknown command: ${command}`);
  }
  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
