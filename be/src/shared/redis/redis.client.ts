// Redis 단일 클라이언트를 제공하는 모듈입니다.
import { Redis } from "ioredis";
import { ENV } from "../../config/env.js";

let cached: Redis | null = null;

function getOrCreate(): Redis {
  if (cached === null) {
    cached = new Redis(ENV.redisUrl(), {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });
  }
  return cached;
}

export const redisClient: Redis = new Proxy({} as Redis, {
  get(_target, prop, receiver) {
    const real = getOrCreate();
    const value = Reflect.get(real, prop, receiver);
    if (typeof value === "function") {
      return value.bind(real);
    }
    return value;
  },
});
