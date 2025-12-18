/**
 * R-tree spatial index operations for GeoPackage.
 * Implements the gpkg_rtree_index extension for efficient spatial queries.
 * @module
 */

import type { Database } from "@db/sqlite";
import type { BoundingBox } from "./types.ts";
import { escapeIdentifier, validateTableName } from "./utils.ts";
import { getGeometryColumn } from "./features.ts";
import { addExtension, hasExtension } from "./extensions.ts";
import { COMMON_EXTENSIONS } from "./extensions.ts";

/**
 * Get R-tree index table name for a feature table.
 */
export function getRtreeTableName(
  tableName: string,
  geometryColumn: string,
): string {
  return `rtree_${tableName}_${geometryColumn}`;
}

/**
 * Check if a spatial index exists for a feature table.
 */
export function hasSpatialIndex(db: Database, tableName: string): boolean {
  validateTableName(tableName);

  const geomCol = getGeometryColumn(db, tableName);
  if (!geomCol) {
    return false;
  }

  const rtreeTable = getRtreeTableName(tableName, geomCol.columnName);

  // Check if the rtree virtual table exists
  const stmt = db.prepare(`
    SELECT COUNT(*) FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `);
  const count = stmt.value<[number]>(rtreeTable);
  stmt.finalize();

  return count !== null && count !== undefined && count[0] > 0;
}

/**
 * Create a spatial index for a feature table.
 * The index must be maintained manually by calling updateSpatialIndexEntry
 * after insert/update/delete operations, or by calling populateSpatialIndex.
 */
export function createSpatialIndex(db: Database, tableName: string): void {
  validateTableName(tableName);

  const geomCol = getGeometryColumn(db, tableName);
  if (!geomCol) {
    throw new Error(`Table ${tableName} is not a feature table`);
  }

  if (hasSpatialIndex(db, tableName)) {
    throw new Error(`Spatial index already exists for table ${tableName}`);
  }

  const rtreeTable = getRtreeTableName(tableName, geomCol.columnName);
  const rtreeTableEsc = escapeIdentifier(rtreeTable);

  // Create the R-tree virtual table
  db.exec(`
    CREATE VIRTUAL TABLE ${rtreeTableEsc} USING rtree(
      id,
      minx, maxx,
      miny, maxy
    )
  `);

  // Register the extension
  if (
    !hasExtension(
      db,
      COMMON_EXTENSIONS.RTREE_INDEX,
      tableName,
      geomCol.columnName,
    )
  ) {
    addExtension(db, {
      tableName,
      columnName: geomCol.columnName,
      extensionName: COMMON_EXTENSIONS.RTREE_INDEX,
      definition: "http://www.geopackage.org/spec120/#extension_rtree",
      scope: "write-only",
    });
  }

  // Populate the index with existing data
  populateSpatialIndex(db, tableName);
}

/**
 * Drop a spatial index for a feature table.
 */
export function dropSpatialIndex(db: Database, tableName: string): void {
  validateTableName(tableName);

  const geomCol = getGeometryColumn(db, tableName);
  if (!geomCol) {
    throw new Error(`Table ${tableName} is not a feature table`);
  }

  if (!hasSpatialIndex(db, tableName)) {
    throw new Error(`Spatial index does not exist for table ${tableName}`);
  }

  const rtreeTable = getRtreeTableName(tableName, geomCol.columnName);
  const rtreeTableEsc = escapeIdentifier(rtreeTable);

  // Drop the R-tree virtual table
  db.exec(`DROP TABLE IF EXISTS ${rtreeTableEsc}`);
}

/**
 * Populate a spatial index from existing feature data.
 * This clears the existing index and rebuilds it from scratch.
 */
export function populateSpatialIndex(db: Database, tableName: string): void {
  validateTableName(tableName);

  const geomCol = getGeometryColumn(db, tableName);
  if (!geomCol) {
    throw new Error(`Table ${tableName} is not a feature table`);
  }

  if (!hasSpatialIndex(db, tableName)) {
    throw new Error(`Spatial index does not exist for table ${tableName}`);
  }

  const rtreeTable = getRtreeTableName(tableName, geomCol.columnName);
  const tableEsc = escapeIdentifier(tableName);
  const geomColEsc = escapeIdentifier(geomCol.columnName);
  const rtreeTableEsc = escapeIdentifier(rtreeTable);

  // Clear existing index data
  db.exec(`DELETE FROM ${rtreeTableEsc}`);

  // Query all features with geometry
  const stmt = db.prepare(`
    SELECT id, ${geomColEsc} FROM ${tableEsc}
    WHERE ${geomColEsc} IS NOT NULL
  `);

  const insertStmt = db.prepare(`
    INSERT INTO ${rtreeTableEsc} (id, minx, maxx, miny, maxy)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const row of stmt.all<Record<string, unknown>>()) {
    const geomBlob = row[geomCol.columnName] as Uint8Array | null;
    if (geomBlob) {
      const bounds = extractEnvelopeFromGeometry(geomBlob);
      if (bounds) {
        insertStmt.run(
          row.id as number,
          bounds.minX,
          bounds.maxX,
          bounds.minY,
          bounds.maxY,
        );
      }
    }
  }

  stmt.finalize();
  insertStmt.finalize();
}

/**
 * Query feature IDs that intersect with a bounding box using the spatial index.
 * Returns an array of feature IDs that potentially intersect (envelope intersection).
 */
export function queryWithSpatialIndex(
  db: Database,
  tableName: string,
  bounds: BoundingBox,
): number[] {
  validateTableName(tableName);

  const geomCol = getGeometryColumn(db, tableName);
  if (!geomCol) {
    throw new Error(`Table ${tableName} is not a feature table`);
  }

  if (!hasSpatialIndex(db, tableName)) {
    throw new Error(`Spatial index does not exist for table ${tableName}`);
  }

  const rtreeTable = getRtreeTableName(tableName, geomCol.columnName);
  const rtreeTableEsc = escapeIdentifier(rtreeTable);

  // Query the R-tree for intersecting features
  // R-tree intersection: index bbox overlaps query bbox
  const stmt = db.prepare(`
    SELECT id FROM ${rtreeTableEsc}
    WHERE maxx >= ? AND minx <= ?
      AND maxy >= ? AND miny <= ?
  `);

  const rows = stmt.values<[number]>(
    bounds.minX,
    bounds.maxX,
    bounds.minY,
    bounds.maxY,
  );
  stmt.finalize();

  return rows.map((row) => row[0]);
}

/**
 * Insert an entry into the spatial index.
 * Called after inserting a feature.
 */
export function insertSpatialIndexEntry(
  db: Database,
  tableName: string,
  featureId: number,
  geometryBlob: Uint8Array | null,
): void {
  if (!hasSpatialIndex(db, tableName)) {
    return; // No index to update
  }

  if (!geometryBlob) {
    return; // No geometry, nothing to index
  }

  const bounds = extractEnvelopeFromGeometry(geometryBlob);
  if (!bounds) {
    return; // Couldn't extract bounds
  }

  const geomCol = getGeometryColumn(db, tableName);
  if (!geomCol) {
    return;
  }

  const rtreeTable = getRtreeTableName(tableName, geomCol.columnName);
  const rtreeTableEsc = escapeIdentifier(rtreeTable);

  const stmt = db.prepare(`
    INSERT INTO ${rtreeTableEsc} (id, minx, maxx, miny, maxy)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(featureId, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
  stmt.finalize();
}

/**
 * Update an entry in the spatial index.
 * Called after updating a feature's geometry.
 */
export function updateSpatialIndexEntry(
  db: Database,
  tableName: string,
  featureId: number,
  geometryBlob: Uint8Array | null,
): void {
  if (!hasSpatialIndex(db, tableName)) {
    return; // No index to update
  }

  const geomCol = getGeometryColumn(db, tableName);
  if (!geomCol) {
    return;
  }

  const rtreeTable = getRtreeTableName(tableName, geomCol.columnName);
  const rtreeTableEsc = escapeIdentifier(rtreeTable);

  // Delete existing entry
  const deleteStmt = db.prepare(`DELETE FROM ${rtreeTableEsc} WHERE id = ?`);
  deleteStmt.run(featureId);
  deleteStmt.finalize();

  // Insert new entry if geometry exists
  if (geometryBlob) {
    const bounds = extractEnvelopeFromGeometry(geometryBlob);
    if (bounds) {
      const insertStmt = db.prepare(`
        INSERT INTO ${rtreeTableEsc} (id, minx, maxx, miny, maxy)
        VALUES (?, ?, ?, ?, ?)
      `);
      insertStmt.run(
        featureId,
        bounds.minX,
        bounds.maxX,
        bounds.minY,
        bounds.maxY,
      );
      insertStmt.finalize();
    }
  }
}

/**
 * Delete an entry from the spatial index.
 * Called after deleting a feature.
 */
export function deleteSpatialIndexEntry(
  db: Database,
  tableName: string,
  featureId: number,
): void {
  if (!hasSpatialIndex(db, tableName)) {
    return; // No index to update
  }

  const geomCol = getGeometryColumn(db, tableName);
  if (!geomCol) {
    return;
  }

  const rtreeTable = getRtreeTableName(tableName, geomCol.columnName);
  const rtreeTableEsc = escapeIdentifier(rtreeTable);

  const stmt = db.prepare(`DELETE FROM ${rtreeTableEsc} WHERE id = ?`);
  stmt.run(featureId);
  stmt.finalize();
}

/**
 * Extract envelope (bounding box) from a GeoPackage binary geometry.
 * Parses the geometry header to get the envelope if present,
 * otherwise calculates it from the WKB coordinates.
 */
export function extractEnvelopeFromGeometry(
  buffer: Uint8Array,
): BoundingBox | undefined {
  if (buffer.length < 8) {
    return undefined;
  }

  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );

  // Check magic number "GP"
  const magic = view.getUint16(0, false);
  if (magic !== 0x4750) {
    return undefined;
  }

  // Read flags byte
  const flags = view.getUint8(3);
  const empty = ((flags >> 4) & 0x01) === 1;
  if (empty) {
    return undefined;
  }

  const envelopeType = (flags >> 1) & 0x07;
  const byteOrder = flags & 0x01;
  const littleEndian = byteOrder === 1;

  // If envelope is present in header, read it directly
  if (envelopeType >= 1 && envelopeType <= 4) {
    // Envelope starts at byte 8 (after header)
    const minX = view.getFloat64(8, littleEndian);
    const maxX = view.getFloat64(16, littleEndian);
    const minY = view.getFloat64(24, littleEndian);
    const maxY = view.getFloat64(32, littleEndian);

    return { minX, minY, maxX, maxY };
  }

  // No envelope in header, need to calculate from WKB
  // Skip header (8 bytes) to get to WKB
  const wkbOffset = 8;
  return calculateBoundsFromWkb(buffer.slice(wkbOffset));
}

/**
 * Calculate bounding box from WKB data.
 */
function calculateBoundsFromWkb(wkb: Uint8Array): BoundingBox | undefined {
  if (wkb.length < 5) {
    return undefined;
  }

  const view = new DataView(wkb.buffer, wkb.byteOffset, wkb.byteLength);
  let offset = 0;

  const byteOrder = view.getUint8(offset++);
  const littleEndian = byteOrder === 1;

  const typeCode = view.getUint32(offset, littleEndian);
  offset += 4;

  const baseType = typeCode % 1000;
  const hasZ = (typeCode >= 1000 && typeCode < 2000) || typeCode >= 3000;
  const hasM = (typeCode >= 2000 && typeCode < 3000) || typeCode >= 3000;
  const dimensions = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);

  const coords: [number, number][] = [];

  function readPoint(): [number, number] {
    const x = view.getFloat64(offset, littleEndian);
    offset += 8;
    const y = view.getFloat64(offset, littleEndian);
    offset += 8;
    // Skip Z and M if present
    offset += (dimensions - 2) * 8;
    return [x, y];
  }

  function readPoints(count: number): void {
    for (let i = 0; i < count; i++) {
      coords.push(readPoint());
    }
  }

  function readLinearRing(): void {
    const numPoints = view.getUint32(offset, littleEndian);
    offset += 4;
    readPoints(numPoints);
  }

  try {
    switch (baseType) {
      case 1: // Point
        coords.push(readPoint());
        break;
      case 2: // LineString
        {
          const numPoints = view.getUint32(offset, littleEndian);
          offset += 4;
          readPoints(numPoints);
        }
        break;
      case 3: // Polygon
        {
          const numRings = view.getUint32(offset, littleEndian);
          offset += 4;
          for (let i = 0; i < numRings; i++) {
            readLinearRing();
          }
        }
        break;
      case 4: // MultiPoint
        {
          const numGeoms = view.getUint32(offset, littleEndian);
          offset += 4;
          for (let i = 0; i < numGeoms; i++) {
            // Each point is a separate WKB geometry
            offset++; // byte order
            offset += 4; // type
            coords.push(readPoint());
          }
        }
        break;
      case 5: // MultiLineString
        {
          const numGeoms = view.getUint32(offset, littleEndian);
          offset += 4;
          for (let i = 0; i < numGeoms; i++) {
            offset++; // byte order
            offset += 4; // type
            const numPoints = view.getUint32(offset, littleEndian);
            offset += 4;
            readPoints(numPoints);
          }
        }
        break;
      case 6: // MultiPolygon
        {
          const numGeoms = view.getUint32(offset, littleEndian);
          offset += 4;
          for (let i = 0; i < numGeoms; i++) {
            offset++; // byte order
            offset += 4; // type
            const numRings = view.getUint32(offset, littleEndian);
            offset += 4;
            for (let j = 0; j < numRings; j++) {
              readLinearRing();
            }
          }
        }
        break;
      case 7: // GeometryCollection
        // For geometry collections, we'd need to recursively parse
        // For now, return undefined and fall back to non-indexed query
        return undefined;
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }

  if (coords.length === 0) {
    return undefined;
  }

  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;

  for (const [x, y] of coords) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { minX, minY, maxX, maxY };
}
