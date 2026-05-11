#!/usr/bin/env node
// fe 번역 리소스에서 ko/en 키 누락이 없는지 확인합니다.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const filePath = resolve(process.cwd(), "src/i18n/messages.ts");
const source = await readFile(filePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const dataUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const mod = await import(dataUrl);
const { messages } = mod;

function flatten(obj, prefix = "") {
  const out = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object") {
      for (const child of flatten(v, next)) out.add(child);
    } else {
      out.add(next);
    }
  }
  return out;
}

const ko = flatten(messages.ko);
const en = flatten(messages.en);
const missingInEn = [...ko].filter((k) => !en.has(k));
const missingInKo = [...en].filter((k) => !ko.has(k));

if (missingInEn.length === 0 && missingInKo.length === 0) {
  console.log("i18n keys ok", { ko: ko.size, en: en.size });
  process.exit(0);
}
if (missingInEn.length > 0) {
  console.error("missing in en:", missingInEn);
}
if (missingInKo.length > 0) {
  console.error("missing in ko:", missingInKo);
}
process.exit(1);
