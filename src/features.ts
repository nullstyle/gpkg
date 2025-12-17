/**
 * Feature table operations for GeoPackage.
 * @module
 */

import type { Database } from "@db/sqlite";
import type {
  BoundingBox,
  ColumnDefinition,
  Feature,
  FeatureQueryOptions,
  FeatureTableConfig,
  Geometry,
  GeometryColumn,
  GeometryType,
} from "./types.ts";
import {
  escapeIdentifier,
  isValidGeometryType,
  normalizeGeometryType,
  validateColumnName,
  validateTableName,
} from "./utils.ts";
import { addContent, hasContent, updateContentTimestamp } from "./contents.ts";
import { hasSpatialReferenceSystem } from "./srs.ts";
import { decodeGeometry, encodeGeometry } from "./geometry.ts";

/**
 * SQL for creating gpkg_geometry_columns table.
 */
export const CREATE_GEOMETRY_COLUMNS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS gpkg_geometry_columns (
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  geometry_type_name TEXT NOT NULL,
  srs_id INTEGER NOT NULL,
  z TINYINT NOT NULL,
  m TINYINT NOT NULL,
  CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
  CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
  CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
);
`;

/**
 * Initialize gpkg_geometry_columns table.
 */
export function initializeGeometryColumnsTable(db: Database): void {
  db.exec(CREATE_GEOMETRY_COLUMNS_TABLE_SQL);
}

/**
 * Create a feature table.
 */
export function createFeatureTable(
  db: Database,
  config: FeatureTableConfig,
): void {
  validateTableName(config.tableName);

  const geometryColumn = config.geometryColumn ?? "geom";
  validateColumnName(geometryColumn);

  if (!isValidGeometryType(config.geometryType)) {
    throw new Error(`Invalid geometry type: ${config.geometryType}`);
  }

  if (!hasSpatialReferenceSystem(db, config.srsId)) {
    throw new Error(`SRS ID ${config.srsId} not found`);
  }

  // Check if table already exists
  if (hasContent(db, config.tableName)) {
    throw new Error(`Table ${config.tableName} already exists`);
  }

  // Build CREATE TABLE statement
  const columns: string[] = [];

  // Add user-defined columns
  if (config.columns) {
    for (const col of config.columns) {
      validateColumnName(col.name);
      if (col.name === geometryColumn) {
        throw new Error(
          `Column name ${col.name} conflicts with geometry column`,
        );
      }
      columns.push(buildColumnDefinition(col));
    }
  }

  // Add geometry column
  columns.push(`${escapeIdentifier(geometryColumn)} BLOB`);

  // Ensure there's a primary key
  const hasPrimaryKey = config.columns?.some((col) => col.primaryKey);
  if (!hasPrimaryKey) {
    columns.unshift("id INTEGER PRIMARY KEY AUTOINCREMENT");
  }

  const createTableSql = `
    CREATE TABLE ${escapeIdentifier(config.tableName)} (
      ${columns.join(",\n      ")}
    )
  `;

  db.exec(createTableSql);

  // Add content entry
  addContent(db, {
    tableName: config.tableName,
    dataType: "features",
    identifier: config.tableName,
    srsId: config.srsId,
  });

  // Add geometry column metadata
  const insertGeomColStmt = db.prepare(`
    INSERT INTO gpkg_geometry_columns
    (table_name, column_name, geometry_type_name, srs_id, z, m)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertGeomColStmt.run(
    config.tableName,
    geometryColumn,
    normalizeGeometryType(config.geometryType),
    config.srsId,
    config.z ?? 0,
    config.m ?? 0,
  );

  insertGeomColStmt.finalize();
}

/**
 * Build column definition SQL.
 */
function buildColumnDefinition(col: ColumnDefinition): string {
  const parts = [escapeIdentifier(col.name), col.type];

  if (col.primaryKey) {
    parts.push("PRIMARY KEY");
    if (col.autoincrement) {
      parts.push("AUTOINCREMENT");
    }
  }

  if (col.notNull) {
    parts.push("NOT NULL");
  }

  if (col.unique && !col.primaryKey) {
    parts.push("UNIQUE");
  }

  if (col.defaultValue !== undefined) {
    if (typeof col.defaultValue === "string") {
      parts.push(`DEFAULT '${col.defaultValue.replace(/'/g, "''")}'`);
    } else if (col.defaultValue === null) {
      parts.push("DEFAULT NULL");
    } else {
      parts.push(`DEFAULT ${col.defaultValue}`);
    }
  }

  return parts.join(" ");
}

/**
 * Get geometry column metadata.
 */
export function getGeometryColumn(
  db: Database,
  tableName: string,
): GeometryColumn | undefined {
  validateTableName(tableName);

  const stmt = db.prepare(`
    SELECT table_name, column_name, geometry_type_name, srs_id, z, m
    FROM gpkg_geometry_columns
    WHERE table_name = ?
  `);

  const row = stmt.value<[string, string, string, number, number, number]>(
    tableName,
  );
  stmt.finalize();

  if (!row) {
    return undefined;
  }

  return {
    tableName: row[0],
    columnName: row[1],
    geometryTypeName: row[2] as GeometryType,
    srsId: row[3],
    z: row[4] as 0 | 1 | 2,
    m: row[5] as 0 | 1 | 2,
  };
}

/**
 * List all geometry columns.
 */
export function listGeometryColumns(db: Database): GeometryColumn[] {
  const stmt = db.prepare(`
    SELECT table_name, column_name, geometry_type_name, srs_id, z, m
    FROM gpkg_geometry_columns
    ORDER BY table_name
  `);

  const rows = stmt.values<[string, string, string, number, number, number]>();
  stmt.finalize();

  return rows.map((row) => ({
    tableName: row[0],
    columnName: row[1],
    geometryTypeName: row[2] as GeometryType,
    srsId: row[3],
    z: row[4] as 0 | 1 | 2,
    m: row[5] as 0 | 1 | 2,
  }));
}

/**
 * Insert a feature into a table.
 */
export function insertFeature<T = Record<string, unknown>>(
  db: Database,
  tableName: string,
  feature: Omit<Feature<T>, "id">,
): number {
  validateTableName(tableName);

  const geomCol = getGeometryColumn(db, tableName);
  if (!geomCol) {
    throw new Error(`Table ${tableName} is not a feature table`);
  }

  // Encode geometry
  const geomBlob = feature.geometry
    ? encodeGeometry(feature.geometry, { srsId: geomCol.srsId })
    : null;

  // Build INSERT statement
  const columns = [escapeIdentifier(geomCol.columnName)];
  const placeholders = ["?"];
  const values: unknown[] = [geomBlob];

  for (
    const [key, value] of Object.entries(
      feature.properties as Record<string, unknown>,
    )
  ) {
    columns.push(escapeIdentifier(key));
    placeholders.push("?");
    values.push(value);
  }

  const sql = `
    INSERT INTO ${escapeIdentifier(tableName)} (${columns.join(", ")})
    VALUES (${placeholders.join(", ")})
  `;

  const stmt = db.prepare(sql);
  stmt.run(...(values as []));
  stmt.finalize();

  const id = db.lastInsertRowId;

  // Update content timestamp
  updateContentTimestamp(db, tableName);

  return id;
}

/**
 * Get a feature by ID.
 */
export function getFeature<T = Record<string, unknown>>(
  db: Database,
  tableName: string,
  id: number,
): Feature<T> | undefined {
  validateTableName(tableName);

  const geomCol = getGeometryColumn(db, tableName);
  if (!geomCol) {
    throw new Error(`Table ${tableName} is not a feature table`);
  }

  const sql = `SELECT * FROM ${escapeIdentifier(tableName)} WHERE id = ?`;
  const stmt = db.prepare(sql);
  const row = stmt.get<Record<string, unknown>>(id);
  stmt.finalize();

  if (!row) {
    return undefined;
  }

  return rowToFeature(row, geomCol.columnName);
}

/**
 * Query features from a table.
 */
export function queryFeatures<T = Record<string, unknown>>(
  db: Database,
  tableName: string,
  options: FeatureQueryOptions = {},
): Feature<T>[] {
  validateTableName(tableName);

  const geomCol = getGeometryColumn(db, tableName);
  if (!geomCol) {
    throw new Error(`Table ${tableName} is not a feature table`);
  }

  // Build query
  let sql = `SELECT * FROM ${escapeIdentifier(tableName)}`;
  const params: unknown[] = [];

  // WHERE clause
  const whereClauses: string[] = [];
  if (options.where) {
    whereClauses.push(`(${options.where})`);
  }

  if (options.bounds) {
    // Simple bounding box filter (not using spatial index)
    whereClauses.push(
      `${escapeIdentifier(geomCol.columnName)} IS NOT NULL`,
    );
  }

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(" AND ")}`;
  }

  // ORDER BY
  if (options.orderBy) {
    sql += ` ORDER BY ${options.orderBy}`;
  }

  // LIMIT
  if (options.limit !== undefined) {
    sql += ` LIMIT ${options.limit}`;
  }

  // OFFSET
  if (options.offset !== undefined) {
    sql += ` OFFSET ${options.offset}`;
  }

  const stmt = db.prepare(sql);
  const rows = stmt.all<Record<string, unknown>>(...(params as []));
  stmt.finalize();

  return rows.map((row) => rowToFeature(row, geomCol.columnName));
}

/**
 * Iterate over all features in a table.
 */
export function* iterateFeatures<T = Record<string, unknown>>(
  db: Database,
  tableName: string,
): Generator<Feature<T>> {
  validateTableName(tableName);

  const geomCol = getGeometryColumn(db, tableName);
  if (!geomCol) {
    throw new Error(`Table ${tableName} is not a feature table`);
  }

  const sql = `SELECT * FROM ${escapeIdentifier(tableName)}`;
  const stmt = db.prepare(sql);

  for (const row of stmt.all<Record<string, unknown>>()) {
    yield rowToFeature(row, geomCol.columnName);
  }

  stmt.finalize();
}

/**
 * Update a feature.
 */
export function updateFeature<T = Record<string, unknown>>(
  db: Database,
  tableName: string,
  id: number,
  updates: Partial<Omit<Feature<T>, "id">>,
): void {
  validateTableName(tableName);

  const geomCol = getGeometryColumn(db, tableName);
  if (!geomCol) {
    throw new Error(`Table ${tableName} is not a feature table`);
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];

  // Update geometry
  if (updates.geometry !== undefined) {
    setClauses.push(`${escapeIdentifier(geomCol.columnName)} = ?`);
    values.push(
      updates.geometry
        ? encodeGeometry(updates.geometry, { srsId: geomCol.srsId })
        : null,
    );
  }

  // Update properties
  if (updates.properties) {
    for (
      const [key, value] of Object.entries(
        updates.properties as Record<string, unknown>,
      )
    ) {
      setClauses.push(`${escapeIdentifier(key)} = ?`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) {
    return; // Nothing to update
  }

  values.push(id);

  const sql = `
    UPDATE ${escapeIdentifier(tableName)}
    SET ${setClauses.join(", ")}
    WHERE id = ?
  `;

  const stmt = db.prepare(sql);
  const changes = stmt.run(...(values as []));
  stmt.finalize();

  if (changes === 0) {
    throw new Error(`Feature with ID ${id} not found in table ${tableName}`);
  }

  // Update content timestamp
  updateContentTimestamp(db, tableName);
}

/**
 * Delete a feature.
 */
export function deleteFeature(
  db: Database,
  tableName: string,
  id: number,
): void {
  validateTableName(tableName);

  const sql = `DELETE FROM ${escapeIdentifier(tableName)} WHERE id = ?`;
  const stmt = db.prepare(sql);
  const changes = stmt.run(id);
  stmt.finalize();

  if (changes === 0) {
    throw new Error(`Feature with ID ${id} not found in table ${tableName}`);
  }

  // Update content timestamp
  updateContentTimestamp(db, tableName);
}

/**
 * Count features in a table.
 */
export function countFeatures(
  db: Database,
  tableName: string,
  options: Pick<FeatureQueryOptions, "where" | "bounds"> = {},
): number {
  validateTableName(tableName);

  let sql = `SELECT COUNT(*) FROM ${escapeIdentifier(tableName)}`;
  const params: unknown[] = [];

  if (options.where) {
    sql += ` WHERE ${options.where}`;
  }

  const stmt = db.prepare(sql);
  const count = stmt.value<[number]>(...(params as []));
  stmt.finalize();

  return count?.[0] ?? 0;
}

/**
 * Calculate bounding box of all features in a table.
 */
export function calculateFeatureBounds(
  db: Database,
  tableName: string,
): BoundingBox | undefined {
  validateTableName(tableName);

  const geomCol = getGeometryColumn(db, tableName);
  if (!geomCol) {
    throw new Error(`Table ${tableName} is not a feature table`);
  }

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  let hasGeometry = false;

  for (const feature of iterateFeatures(db, tableName)) {
    if (feature.geometry) {
      hasGeometry = true;
      const coords = extractCoordinates(feature.geometry);
      for (const [x, y] of coords) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (!hasGeometry) {
    return undefined;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Convert database row to feature object.
 */
function rowToFeature<T = Record<string, unknown>>(
  row: Record<string, unknown>,
  geometryColumn: string,
): Feature<T> {
  const { [geometryColumn]: geomBlob, id, ...properties } = row;

  let geometry: Geometry | null = null;
  if (geomBlob && geomBlob instanceof Uint8Array) {
    const decoded = decodeGeometry(geomBlob);
    const { srsId: _srsId, ...geom } = decoded;
    geometry = geom;
  }

  return {
    id: id as number | undefined,
    geometry,
    properties: properties as T,
  };
}

/**
 * Extract coordinate pairs from geometry.
 */
function extractCoordinates(geometry: Geometry): [number, number][] {
  const coords: [number, number][] = [];

  function extract(geom: Geometry) {
    if (geom.type === "Point") {
      const c = geom.coordinates as number[];
      coords.push([c[0], c[1]]);
    } else if (geom.type === "LineString" || geom.type === "MultiPoint") {
      for (const c of geom.coordinates as number[][]) {
        coords.push([c[0], c[1]]);
      }
    } else if (geom.type === "Polygon" || geom.type === "MultiLineString") {
      for (const ring of geom.coordinates as number[][][]) {
        for (const c of ring) {
          coords.push([c[0], c[1]]);
        }
      }
    } else if (geom.type === "MultiPolygon") {
      for (const polygon of geom.coordinates as number[][][][]) {
        for (const ring of polygon) {
          for (const c of ring) {
            coords.push([c[0], c[1]]);
          }
        }
      }
    } else if (geom.type === "GeometryCollection" && geom.geometries) {
      for (const g of geom.geometries) {
        extract(g);
      }
    }
  }

  extract(geometry);
  return coords;
}
