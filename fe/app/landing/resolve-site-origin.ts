// 요청 헤더로 공개 사이트 origin(URL)을 만들어 메타데이터와 JSON-LD에 씁니다.
import { headers } from "next/headers";

export async function resolveSiteOrigin(): Promise<URL> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (typeof host !== "string" || host.length === 0) {
    throw new Error("요청 헤더에 host가 없어 공개 URL을 만들 수 없습니다.");
  }
  const forwardedProto = h.get("x-forwarded-proto");
  const proto =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https";
  return new URL(`${proto}://${host}`);
}
