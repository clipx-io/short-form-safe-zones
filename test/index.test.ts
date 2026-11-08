import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CANVAS, PLATFORMS, data, getSafeZone, isInSafeZone, safeForAll } from "../src/index.js";

const json = JSON.parse(readFileSync(new URL("../data/safe-zones.json", import.meta.url), "utf8"));

describe("data", () => {
  it("src/data.ts matches data/safe-zones.json (run node scripts/gen-data.mjs)", () => {
    const { $comment, ...rest } = json;
    expect(data).toEqual(rest);
  });

  it("px and pct agree for every margin", () => {
    for (const p of PLATFORMS) {
      const m = data.platforms[p].margins;
      for (const side of ["top", "bottom"] as const) {
        expect(Math.abs(m[side].px - (m[side].pct / 100) * CANVAS.height)).toBeLessThan(1);
      }
      for (const side of ["left", "right"] as const) {
        expect(Math.abs(m[side].px - (m[side].pct / 100) * CANVAS.width)).toBeLessThan(1);
      }
    }
  });

  it("every platform has an https source and a verified date", () => {
    for (const p of PLATFORMS) {
      const d = data.platforms[p];
      expect(d.sources.length).toBeGreaterThan(0);
      for (const s of d.sources) expect(s.url).toMatch(/^https:\/\//);
      expect(d.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("overlays match the data", () => {
    for (const key of [...PLATFORMS, "all"] as const) {
      const svg = readFileSync(new URL(`../overlays/${key}.svg`, import.meta.url), "utf8");
      const m = getSafeZone(key).margins;
      expect(svg).toContain(`top ${m.top}  bottom ${m.bottom}  left ${m.left}  right ${m.right} px`);
    }
  });
});

describe("getSafeZone", () => {
  it("returns the official numbers at 1080x1920", () => {
    const yt = getSafeZone("youtube-shorts");
    expect(yt.margins).toEqual({ top: 288, bottom: 672, left: 48, right: 192 });
    expect(yt.safeRect).toEqual({ x: 48, y: 288, width: 840, height: 960 });
    expect(getSafeZone("tiktok").boxes).toHaveLength(1);
  });

  it("scales to other 9:16 sizes and rounds the unsafe area outward", () => {
    const z = getSafeZone("instagram-reels", { width: 720, height: 1280 });
    // 269 * 2/3 = 179.33 -> 180, 672 * 2/3 = 448, 65 * 2/3 = 43.33 -> 44
    expect(z.margins).toEqual({ top: 180, bottom: 448, left: 44, right: 44 });
    const tt = getSafeZone("tiktok", { width: 2160, height: 3840 });
    expect(tt.margins).toEqual({ top: 480, bottom: 1320, left: 240, right: 240 });
    expect(tt.boxes[0]).toMatchObject({ x: 1560, y: 1680, width: 360, height: 2160 });
  });

  it("rejects sizes that are not 9:16", () => {
    expect(() => getSafeZone("tiktok", { width: 1920, height: 1080 })).toThrow(RangeError);
    expect(() => getSafeZone("tiktok", { width: 1080, height: 1350 })).toThrow(RangeError);
    expect(() => getSafeZone("tiktok", { width: 0, height: 0 })).toThrow(RangeError);
  });

  it("rejects unknown platforms", () => {
    // @ts-expect-error testing a bad key
    expect(() => getSafeZone("myspace")).toThrow(/Unknown platform/);
  });
});

describe("safeForAll", () => {
  it("takes the largest margin per side and keeps every box", () => {
    const all = safeForAll();
    expect(all.margins).toEqual({ top: 288, bottom: 672, left: 120, right: 192 });
    expect(all.boxes.map((b) => b.id)).toEqual(["tiktok:right-actions"]);
  });

  it("is never larger than any single platform's safe rect", () => {
    const all = safeForAll().safeRect;
    for (const p of PLATFORMS) {
      const s = getSafeZone(p).safeRect;
      expect(all.x).toBeGreaterThanOrEqual(s.x);
      expect(all.y).toBeGreaterThanOrEqual(s.y);
      expect(all.x + all.width).toBeLessThanOrEqual(s.x + s.width);
      expect(all.y + all.height).toBeLessThanOrEqual(s.y + s.height);
    }
  });
});

describe("isInSafeZone", () => {
  const caption = { x: 200, y: 900, width: 500, height: 120 };

  it("accepts a rect inside the zone", () => {
    expect(isInSafeZone(caption, "all")).toBe(true);
  });

  it("rejects a rect in the bottom caption area", () => {
    expect(isInSafeZone({ x: 200, y: 1500, width: 500, height: 120 }, "instagram-reels")).toBe(false);
  });

  it("rejects a rect under TikTok's right-side buttons", () => {
    const r = { x: 600, y: 1000, width: 220, height: 100 };
    expect(isInSafeZone(r, "instagram-reels")).toBe(true);
    expect(isInSafeZone(r, "tiktok")).toBe(false);
  });

  it("allows a rect that touches the safe edge", () => {
    const s = getSafeZone("youtube-shorts").safeRect;
    expect(isInSafeZone(s, "youtube-shorts")).toBe(true);
  });

  it("works in the pixel space of another size", () => {
    expect(isInSafeZone({ x: 100, y: 450, width: 300, height: 60 }, "all", { width: 720, height: 1280 })).toBe(true);
  });
});
