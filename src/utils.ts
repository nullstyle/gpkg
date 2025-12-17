/**
 * Utility functions for GeoPackage operations.
 * @module
 */

import type { BoundingBox } from "./types.ts";

/**
 * Generate ISO 8601 timestamp for current time.
 */
export function currentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Validate table name (alphanumeric and underscores only).
 */
export function validateTableName(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid table name: ${name}`);
  }
}

/**
 * Validate column name (alphanumeric and underscores only).
 */
export function validateColumnName(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid column name: ${name}`);
  }
}

/**
 * Escape SQL identifier.
 */
export function escapeIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Check if bounding boxes intersect.
 */
export function boundsIntersect(a: BoundingBox, b: BoundingBox): boolean {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  );
}

/**
 * Expand bounding box to include point.
 */
export function expandBounds(
  bounds: BoundingBox | undefined,
  x: number,
  y: number,
): BoundingBox {
  if (!bounds) {
    return { minX: x, minY: y, maxX: x, maxY: y };
  }
  return {
    minX: Math.min(bounds.minX, x),
    minY: Math.min(bounds.minY, y),
    maxX: Math.max(bounds.maxX, x),
    maxY: Math.max(bounds.maxY, y),
  };
}

/**
 * Merge two bounding boxes.
 */
export function mergeBounds(
  a: BoundingBox | undefined,
  b: BoundingBox | undefined,
): BoundingBox | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Check if a value is a valid SRS ID.
 */
export function isValidSrsId(srsId: number): boolean {
  return Number.isInteger(srsId);
}

/**
 * Convert geometry type to uppercase.
 */
export function normalizeGeometryType(type: string): string {
  return type.toUpperCase();
}

/**
 * Check if geometry type is valid.
 */
export function isValidGeometryType(type: string): boolean {
  const validTypes = [
    "GEOMETRY",
    "POINT",
    "LINESTRING",
    "POLYGON",
    "MULTIPOINT",
    "MULTILINESTRING",
    "MULTIPOLYGON",
    "GEOMETRYCOLLECTION",
    "CIRCULARSTRING",
    "COMPOUNDCURVE",
    "CURVEPOLYGON",
    "MULTICURVE",
    "MULTISURFACE",
    "CURVE",
    "SURFACE",
  ];
  return validTypes.includes(normalizeGeometryType(type));
}

/**
 * Get WKB geometry type code.
 */
export function getWkbTypeCode(type: string): number {
  const codes: Record<string, number> = {
    GEOMETRY: 0,
    POINT: 1,
    LINESTRING: 2,
    POLYGON: 3,
    MULTIPOINT: 4,
    MULTILINESTRING: 5,
    MULTIPOLYGON: 6,
    GEOMETRYCOLLECTION: 7,
    CIRCULARSTRING: 8,
    COMPOUNDCURVE: 9,
    CURVEPOLYGON: 10,
    MULTICURVE: 11,
    MULTISURFACE: 12,
    CURVE: 13,
    SURFACE: 14,
  };
  return codes[normalizeGeometryType(type)] ?? 0;
}

/**
 * Get geometry type name from WKB code.
 */
export function getGeometryTypeName(code: number): string {
  const names: Record<number, string> = {
    0: "GEOMETRY",
    1: "POINT",
    2: "LINESTRING",
    3: "POLYGON",
    4: "MULTIPOINT",
    5: "MULTILINESTRING",
    6: "MULTIPOLYGON",
    7: "GEOMETRYCOLLECTION",
    8: "CIRCULARSTRING",
    9: "COMPOUNDCURVE",
    10: "CURVEPOLYGON",
    11: "MULTICURVE",
    12: "MULTISURFACE",
    13: "CURVE",
    14: "SURFACE",
  };
  return names[code % 1000] ?? "GEOMETRY";
}

/**
 * Check if a number is a valid zoom level.
 */
export function isValidZoomLevel(zoom: number): boolean {
  return Number.isInteger(zoom) && zoom >= 0 && zoom <= 30;
}

/**
 * Calculate tile bounds for given zoom level.
 */
export function getTileBounds(
  zoom: number,
  column: number,
  row: number,
  bounds: BoundingBox,
): BoundingBox {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const tilesPerRow = Math.pow(2, zoom);
  const tileWidth = width / tilesPerRow;
  const tileHeight = height / tilesPerRow;

  return {
    minX: bounds.minX + column * tileWidth,
    maxX: bounds.minX + (column + 1) * tileWidth,
    minY: bounds.minY + row * tileHeight,
    maxY: bounds.minY + (row + 1) * tileHeight,
  };
}
