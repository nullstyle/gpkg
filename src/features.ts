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
  boundsIntersect,
  escapeIdentifier,
  isValidGeometryType,
  normalizeGeometryType,
  validateColumnName,
  validateTableName,
} from "./utils.ts";
import {
  addContent,
  hasContent,
  updateContentBounds,
  updateContentTimestamp,
} from "./contents.ts";
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

  // Validate geometry type and dimensions match declared type
  if (feature.geometry) {
    validateGeometry(feature.geometry, geomCol, tableName);
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

  // Update bounds if the feature has geometry
  if (feature.geometry) {
    updateTableBounds(db, tableName);
  }

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
    whereClauses.push(`(${options.where.sql})`);
    params.push(...options.where.params);
  }

  if (options.bounds) {
    // Filter out null geometries when bounds filtering is requested
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

  // LIMIT and OFFSET are applied after bounds filtering in memory
  // when bounds is specified, otherwise apply in SQL
  if (!options.bounds) {
    if (options.limit !== undefined) {
      sql += ` LIMIT ${options.limit}`;
    }
    if (options.offset !== undefined) {
      sql += ` OFFSET ${options.offset}`;
    }
  }

  const stmt = db.prepare(sql);
  const rows = stmt.all<Record<string, unknown>>(...(params as []));
  stmt.finalize();

  let features = rows.map((row) => rowToFeature<T>(row, geomCol.columnName));

  // Apply bounding box filtering in memory if bounds specified
  if (options.bounds) {
    features = features.filter((feature) => {
      if (!feature.geometry) return false;
      const featureBounds = calculateGeometryBounds(feature.geometry);
      if (!featureBounds) return false;
      return boundsIntersect(featureBounds, options.bounds!);
    });

    // Apply limit and offset after filtering
    if (options.offset !== undefined) {
      features = features.slice(options.offset);
    }
    if (options.limit !== undefined) {
      features = features.slice(0, options.limit);
    }
  }

  return features;
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
    // Validate geometry type and dimensions match declared type
    if (updates.geometry) {
      validateGeometry(updates.geometry, geomCol, tableName);
    }
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

  // Update bounds if geometry was changed
  if (updates.geometry !== undefined) {
    updateTableBounds(db, tableName);
  }
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

  // Recalculate bounds after deletion
  updateTableBounds(db, tableName);
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
    sql += ` WHERE ${options.where.sql}`;
    params.push(...options.where.params);
  }

  const stmt = db.prepare(sql);
  const count = stmt.value<[number]>(...(params as []));
  stmt.finalize();

  return count?.[0] ?? 0;
}

/**
 * Update the bounds in gpkg_contents for a feature table.
 * Recalculates the bounding box from all features.
 */
function updateTableBounds(db: Database, tableName: string): void {
  const bounds = calculateFeatureBounds(db, tableName);
  if (bounds) {
    updateContentBounds(db, tableName, bounds);
  }
}

/**
 * Mapping of GeoJSON geometry types to GeoPackage geometry type names.
 */
const GEOJSON_TO_GPKG_TYPE: Record<string, string> = {
  Point: "POINT",
  LineString: "LINESTRING",
  Polygon: "POLYGON",
  MultiPoint: "MULTIPOINT",
  MultiLineString: "MULTILINESTRING",
  MultiPolygon: "MULTIPOLYGON",
  GeometryCollection: "GEOMETRYCOLLECTION",
};

/**
 * Check if a geometry type is compatible with the declared column type.
 */
function isGeometryTypeCompatible(
  geometryType: string,
  declaredType: GeometryType,
): boolean {
  const normalizedDeclared = normalizeGeometryType(declaredType);
  const normalizedGeom = normalizeGeometryType(
    GEOJSON_TO_GPKG_TYPE[geometryType] ?? geometryType,
  );

  // GEOMETRY accepts any geometry type
  if (normalizedDeclared === "GEOMETRY") {
    return true;
  }

  // Exact match
  if (normalizedGeom === normalizedDeclared) {
    return true;
  }

  // CURVE accepts LINESTRING, CIRCULARSTRING, COMPOUNDCURVE
  if (normalizedDeclared === "CURVE") {
    return ["LINESTRING", "CIRCULARSTRING", "COMPOUNDCURVE"].includes(
      normalizedGeom,
    );
  }

  // SURFACE accepts POLYGON, CURVEPOLYGON
  if (normalizedDeclared === "SURFACE") {
    return ["POLYGON", "CURVEPOLYGON"].includes(normalizedGeom);
  }

  // MULTICURVE accepts MULTILINESTRING
  if (normalizedDeclared === "MULTICURVE") {
    return ["MULTILINESTRING"].includes(normalizedGeom);
  }

  // MULTISURFACE accepts MULTIPOLYGON
  if (normalizedDeclared === "MULTISURFACE") {
    return ["MULTIPOLYGON"].includes(normalizedGeom);
  }

  return false;
}

/**
 * Validate that a geometry matches the declared type and dimensions for a table.
 * Throws an error if the geometry type or dimensions are incompatible.
 */
function validateGeometry(
  geometry: Geometry,
  geomCol: GeometryColumn,
  tableName: string,
): void {
  // Validate geometry type
  if (!isGeometryTypeCompatible(geometry.type, geomCol.geometryTypeName)) {
    throw new Error(
      `Geometry type ${geometry.type} is not compatible with declared type ${geomCol.geometryTypeName} for table ${tableName}`,
    );
  }

  // Validate Z dimension
  const hasZ = geometryHasZ(geometry);
  if (geomCol.z === 0 && hasZ) {
    throw new Error(
      `Geometry has Z coordinates but table ${tableName} prohibits Z values`,
    );
  }
  if (geomCol.z === 1 && !hasZ) {
    throw new Error(
      `Geometry missing Z coordinates but table ${tableName} requires Z values`,
    );
  }

  // Validate M dimension
  const hasM = geometryHasM(geometry);
  if (geomCol.m === 0 && hasM) {
    throw new Error(
      `Geometry has M coordinates but table ${tableName} prohibits M values`,
    );
  }
  if (geomCol.m === 1 && !hasM) {
    throw new Error(
      `Geometry missing M coordinates but table ${tableName} requires M values`,
    );
  }
}

/**
 * Check if a geometry has Z coordinates.
 */
function geometryHasZ(geometry: Geometry): boolean {
  const firstCoord = getFirstCoordinate(geometry);
  if (!firstCoord) return false;
  // Check first coordinate - if it has 3+ components, it has Z
  return firstCoord.length >= 3;
}

/**
 * Check if a geometry has M coordinates.
 */
function geometryHasM(geometry: Geometry): boolean {
  const firstCoord = getFirstCoordinate(geometry);
  if (!firstCoord) return false;
  // Check first coordinate - if it has 4 components, it has M (XYZM)
  // Note: XYM (3 components with M but no Z) is rare but technically possible
  // For simplicity, we assume 4 components = XYZM
  return firstCoord.length >= 4;
}

/**
 * Get the first coordinate from a geometry (preserving all dimensions).
 */
function getFirstCoordinate(geometry: Geometry): number[] | undefined {
  if (geometry.type === "Point") {
    return geometry.coordinates as number[];
  } else if (geometry.type === "LineString" || geometry.type === "MultiPoint") {
    const coords = geometry.coordinates as number[][];
    return coords.length > 0 ? coords[0] : undefined;
  } else if (
    geometry.type === "Polygon" || geometry.type === "MultiLineString"
  ) {
    const rings = geometry.coordinates as number[][][];
    return rings.length > 0 && rings[0].length > 0 ? rings[0][0] : undefined;
  } else if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates as number[][][][];
    return polygons.length > 0 && polygons[0].length > 0 &&
        polygons[0][0].length > 0
      ? polygons[0][0][0]
      : undefined;
  } else if (geometry.type === "GeometryCollection" && geometry.geometries) {
    for (const g of geometry.geometries) {
      const coord = getFirstCoordinate(g);
      if (coord) return coord;
    }
  }
  return undefined;
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
 * Calculate bounding box from a geometry.
 */
function calculateGeometryBounds(geometry: Geometry): BoundingBox | undefined {
  const coords = extractCoordinates(geometry);
  if (coords.length === 0) {
    return undefined;
  }

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const [x, y] of coords) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
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
