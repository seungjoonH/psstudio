// 테스트가 개발 DB를 건드리지 않도록 DATABASE_URL을 검증하는 유틸입니다.
export function assertTestDatabaseUrl(databaseUrl: string): void {
  let dbName = "";
  try {
    const parsed = new URL(databaseUrl);
    dbName = decodeURIComponent(parsed.pathname.replace(/^\//, "")).toLowerCase();
  } catch {
    throw new Error("DATABASE_URL 파싱에 실패했습니다. 테스트 전용 DB URL을 확인해 주세요.");
  }
  if (!dbName.includes("test")) {
    throw new Error(
      `테스트 DB 안전 가드에 걸렸습니다. 데이터베이스 이름에 'test'가 포함되어야 합니다. (현재: ${dbName || "(비어있음)"})`,
    );
  }
}
