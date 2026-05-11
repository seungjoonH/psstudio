// 언어 감지 단위 테스트입니다.
import { describe, expect, it } from "vitest";
import { detectLanguage } from "../language-detect.js";

describe("detectLanguage", () => {
  it("Python 코드를 감지한다", () => {
    const r = detectLanguage(`def add(a, b):\n    return a + b\nprint(add(1, 2))`);
    expect(r.best).toBe("python");
  });

  it("Java 코드를 감지한다", () => {
    const r = detectLanguage(`public class Main { public static void main(String[] args) { System.out.println("hi"); } }`);
    expect(r.best).toBe("java");
  });

  it("C++ 코드를 감지한다", () => {
    const r = detectLanguage(`#include <iostream>\nint main(){ std::cout << "hi"; }`);
    expect(r.best).toBe("cpp");
  });

  it("TypeScript와 JavaScript를 구분한다", () => {
    const ts = detectLanguage(`function add(a: number, b: number): number { return a + b; }`);
    expect(ts.best).toBe("typescript");
    const js = detectLanguage(`function add(a, b) { console.log(a + b); return a + b; }`);
    expect(js.best).toBe("javascript");
  });

  it("아무 키워드와도 일치하지 않으면 other를 반환한다", () => {
    const r = detectLanguage(`hello world plain text`);
    expect(r.best).toBe("other");
  });
});
