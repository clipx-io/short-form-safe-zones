export type Platform = "tiktok" | "youtube-shorts" | "instagram-reels" | "facebook-reels";

/** A platform key, or "all" for the combined zone that is safe on every platform. */
export type ZoneKey = Platform | "all";

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Margins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Box extends Rect {
  id: string;
  label: string;
}

export interface SafeZone {
  key: ZoneKey;
  name: string;
  size: Size;
  /** Unsafe margins from each edge, in px. */
  margins: Margins;
  /** The safe rectangle inside the margins. */
  safeRect: Rect;
  /** Extra unsafe UI areas inside or across the safe rectangle (for example TikTok's right-side buttons). */
  boxes: Box[];
}

export interface Source {
  title: string;
  url: string;
  kind: string;
}

export interface PlatformData {
  name: string;
  placement: string;
  margins: Record<keyof Margins, { px: number; pct: number }>;
  boxes: Box[];
  basis: string;
  sources: Source[];
  verified: string;
  notes: string;
}

export interface SafeZoneData {
  version: string;
  canvas: Size;
  platforms: Record<Platform, PlatformData>;
  excluded: Record<string, string>;
}
