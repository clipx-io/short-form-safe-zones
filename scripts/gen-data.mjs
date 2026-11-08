// Writes src/data.ts from data/safe-zones.json so the library has no runtime JSON import.
// Run: node scripts/gen-data.mjs
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const json = JSON.parse(readFileSync(new URL("data/safe-zones.json", root), "utf8"));
const { $comment, ...data } = json;

const out = `// Generated from data/safe-zones.json by scripts/gen-data.mjs. Do not edit by hand.
import type { SafeZoneData } from "./types.js";

export const data: SafeZoneData = ${JSON.stringify(data, null, 2)};
`;
writeFileSync(new URL("src/data.ts", root), out);
console.log("wrote src/data.ts");
