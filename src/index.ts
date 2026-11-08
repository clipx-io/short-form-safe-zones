import { data } from "./data.js";
import type { Box, Margins, Platform, Rect, SafeZone, Size, ZoneKey } from "./types.js";

export type { Box, Margins, Platform, PlatformData, Rect, SafeZone, SafeZoneData, Size, Source, ZoneKey } from "./types.js";
export { data };

/** Every platform in the data set. */
export const PLATFORMS = Object.keys(data.platforms) as Platform[];

/** The reference canvas that all numbers in the data set use (1080x1920). */
export const CANVAS: Size = { ...data.canvas };

const RATIO = 9 / 16;
/** Allowed difference from an exact 9:16 ratio (1%), so sizes like 720x1281 still work. */
const RATIO_TOLERANCE = 0.01;

function checkSize(size: Size): void {
  const { width, height } = size;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError(`Size must have a positive width and height, got ${width}x${height}.`);
  }
  if (Math.abs(width / height - RATIO) / RATIO > RATIO_TOLERANCE) {
    throw new RangeError(`Size must be 9:16 (vertical), got ${width}x${height}.`);
  }
}

function isPlatform(key: string): key is Platform {
  return Object.prototype.hasOwnProperty.call(data.platforms, key);
}

/** Margins and boxes on the 1080x1920 reference canvas. */
function baseZone(key: ZoneKey): { name: string; margins: Margins; boxes: Box[] } {
  if (key === "all") {
    const sides: (keyof Margins)[] = ["top", "bottom", "left", "right"];
    const margins = Object.fromEntries(
      sides.map((side) => [side, Math.max(...PLATFORMS.map((p) => data.platforms[p].margins[side].px))]),
    ) as unknown as Margins;
    const boxes = PLATFORMS.flatMap((p) =>
      data.platforms[p].boxes.map((b) => ({ ...b, id: `${p}:${b.id}`, label: `${data.platforms[p].name}: ${b.label}` })),
    );
    return { name: "Safe for all", margins, boxes };
  }
  if (!isPlatform(key)) {
    throw new RangeError(`Unknown platform "${String(key)}". Use one of: ${PLATFORMS.join(", ")}, all.`);
  }
  const p = data.platforms[key];
  return {
    name: p.name,
    margins: {
      top: p.margins.top.px,
      bottom: p.margins.bottom.px,
      left: p.margins.left.px,
      right: p.margins.right.px,
    },
    boxes: p.boxes.map((b) => ({ ...b })),
  };
}

/**
 * Get the safe zone of a platform for any 9:16 size.
 * Values are scaled from 1080x1920 and rounded outward, so the unsafe area never shrinks.
 */
export function getSafeZone(platform: ZoneKey, size: Size = CANVAS): SafeZone {
  checkSize(size);
  const { width, height } = size;
  const sx = width / CANVAS.width;
  const sy = height / CANVAS.height;
  const base = baseZone(platform);

  const margins: Margins = {
    top: Math.ceil(base.margins.top * sy),
    bottom: Math.ceil(base.margins.bottom * sy),
    left: Math.ceil(base.margins.left * sx),
    right: Math.ceil(base.margins.right * sx),
  };
  const boxes: Box[] = base.boxes.map((b) => {
    const x = Math.floor(b.x * sx);
    const y = Math.floor(b.y * sy);
    return {
      ...b,
      x,
      y,
      width: Math.min(width, Math.ceil((b.x + b.width) * sx)) - x,
      height: Math.min(height, Math.ceil((b.y + b.height) * sy)) - y,
    };
  });

  return {
    key: platform,
    name: base.name,
    size: { width, height },
    margins,
    safeRect: {
      x: margins.left,
      y: margins.top,
      width: width - margins.left - margins.right,
      height: height - margins.top - margins.bottom,
    },
    boxes,
  };
}

/** The zone that is safe on every platform in the data set. */
export function safeForAll(size: Size = CANVAS): SafeZone {
  return getSafeZone("all", size);
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * True when the rect is fully inside the safe rectangle and does not overlap any UI box.
 * The rect uses the same pixel space as `size` (default 1080x1920). Touching an edge is allowed.
 */
export function isInSafeZone(rect: Rect, platform: ZoneKey, size: Size = CANVAS): boolean {
  const zone = getSafeZone(platform, size);
  const s = zone.safeRect;
  const inside =
    rect.x >= s.x && rect.y >= s.y && rect.x + rect.width <= s.x + s.width && rect.y + rect.height <= s.y + s.height;
  return inside && !zone.boxes.some((b) => overlaps(rect, b));
}
