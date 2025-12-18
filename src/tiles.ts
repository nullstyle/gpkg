/**
 * Tile operations for GeoPackage.
 * @module
 */

import type { Database } from "@db/sqlite";
import type {
  Tile,
  TileMatrix,
  TileMatrixSet,
  TileQueryOptions,
} from "./types.ts";
import {
  escapeIdentifier,
  isValidZoomLevel,
  validateTableName,
} from "./utils.ts";
import { addContent, hasContent, updateContentTimestamp } from "./contents.ts";
import { hasSpatialReferenceSystem } from "./srs.ts";

/**
 * SQL for creating gpkg_tile_matrix_set table.
 */
export const CREATE_TILE_MATRIX_SET_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS gpkg_tile_matrix_set (
  table_name TEXT NOT NULL PRIMARY KEY,
  srs_id INTEGER NOT NULL,
  min_x DOUBLE NOT NULL,
  min_y DOUBLE NOT NULL,
  max_x DOUBLE NOT NULL,
  max_y DOUBLE NOT NULL,
  CONSTRAINT fk_gtms_table_name FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
  CONSTRAINT fk_gtms_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
);
`;

/**
 * SQL for creating gpkg_tile_matrix table.
 */
export const CREATE_TILE_MATRIX_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS gpkg_tile_matrix (
  table_name TEXT NOT NULL,
  zoom_level INTEGER NOT NULL,
  matrix_width INTEGER NOT NULL,
  matrix_height INTEGER NOT NULL,
  tile_width INTEGER NOT NULL,
  tile_height INTEGER NOT NULL,
  pixel_x_size DOUBLE NOT NULL,
  pixel_y_size DOUBLE NOT NULL,
  CONSTRAINT pk_ttm PRIMARY KEY (table_name, zoom_level),
  CONSTRAINT fk_tmm_table_name FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name)
);
`;

/**
 * Initialize tile matrix tables.
 */
export function initializeTileMatrixTables(db: Database): void {
  db.exec(CREATE_TILE_MATRIX_SET_TABLE_SQL);
  db.exec(CREATE_TILE_MATRIX_TABLE_SQL);
}

/**
 * Create a tile matrix set and tile pyramid table.
 */
export function createTileMatrixSet(db: Database, config: TileMatrixSet): void {
  validateTableName(config.tableName);

  if (!hasSpatialReferenceSystem(db, config.srsId)) {
    throw new Error(`SRS ID ${config.srsId} not found`);
  }

  if (hasContent(db, config.tableName)) {
    throw new Error(`Table ${config.tableName} already exists`);
  }

  // Create tile pyramid user data table
  const createTableSql = `
    CREATE TABLE ${escapeIdentifier(config.tableName)} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zoom_level INTEGER NOT NULL,
      tile_column INTEGER NOT NULL,
      tile_row INTEGER NOT NULL,
      tile_data BLOB NOT NULL,
      UNIQUE (zoom_level, tile_column, tile_row)
    )
  `;

  db.exec(createTableSql);

  // Add content entry
  addContent(db, {
    tableName: config.tableName,
    dataType: "tiles",
    identifier: config.tableName,
    srsId: config.srsId,
    bounds: {
      minX: config.minX,
      minY: config.minY,
      maxX: config.maxX,
      maxY: config.maxY,
    },
  });

  // Add tile matrix set entry
  const insertStmt = db.prepare(`
    INSERT INTO gpkg_tile_matrix_set (table_name, srs_id, min_x, min_y, max_x, max_y)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertStmt.run(
    config.tableName,
    config.srsId,
    config.minX,
    config.minY,
    config.maxX,
    config.maxY,
  );

  insertStmt.finalize();
}

/**
 * Get tile matrix set by table name.
 */
export function getTileMatrixSet(
  db: Database,
  tableName: string,
): TileMatrixSet | undefined {
  validateTableName(tableName);

  const stmt = db.prepare(`
    SELECT table_name, srs_id, min_x, min_y, max_x, max_y
    FROM gpkg_tile_matrix_set
    WHERE table_name = ?
  `);

  const row = stmt.value<[string, number, number, number, number, number]>(
    tableName,
  );
  stmt.finalize();

  if (!row) {
    return undefined;
  }

  return {
    tableName: row[0],
    srsId: row[1],
    minX: row[2],
    minY: row[3],
    maxX: row[4],
    maxY: row[5],
  };
}

/**
 * List all tile matrix sets.
 */
export function listTileMatrixSets(db: Database): TileMatrixSet[] {
  const stmt = db.prepare(`
    SELECT table_name, srs_id, min_x, min_y, max_x, max_y
    FROM gpkg_tile_matrix_set
    ORDER BY table_name
  `);

  const rows = stmt.values<[string, number, number, number, number, number]>();
  stmt.finalize();

  return rows.map((row) => ({
    tableName: row[0],
    srsId: row[1],
    minX: row[2],
    minY: row[3],
    maxX: row[4],
    maxY: row[5],
  }));
}

/**
 * Add a tile matrix (zoom level) to a tile matrix set.
 */
export function addTileMatrix(db: Database, matrix: TileMatrix): void {
  validateTableName(matrix.tableName);

  if (!isValidZoomLevel(matrix.zoomLevel)) {
    throw new Error(`Invalid zoom level: ${matrix.zoomLevel}`);
  }

  // Check if tile matrix set exists
  const tileMatrixSet = getTileMatrixSet(db, matrix.tableName);
  if (!tileMatrixSet) {
    throw new Error(`Tile matrix set ${matrix.tableName} not found`);
  }

  // Check if zoom level already exists
  const existing = getTileMatrix(db, matrix.tableName, matrix.zoomLevel);
  if (existing) {
    throw new Error(
      `Tile matrix for ${matrix.tableName} at zoom level ${matrix.zoomLevel} already exists`,
    );
  }

  const stmt = db.prepare(`
    INSERT INTO gpkg_tile_matrix 
    (table_name, zoom_level, matrix_width, matrix_height, tile_width, tile_height, pixel_x_size, pixel_y_size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    matrix.tableName,
    matrix.zoomLevel,
    matrix.matrixWidth,
    matrix.matrixHeight,
    matrix.tileWidth,
    matrix.tileHeight,
    matrix.pixelXSize,
    matrix.pixelYSize,
  );

  stmt.finalize();
}

/**
 * Get tile matrix by table name and zoom level.
 */
export function getTileMatrix(
  db: Database,
  tableName: string,
  zoomLevel: number,
): TileMatrix | undefined {
  validateTableName(tableName);

  const stmt = db.prepare(`
    SELECT table_name, zoom_level, matrix_width, matrix_height, tile_width, tile_height, pixel_x_size, pixel_y_size
    FROM gpkg_tile_matrix
    WHERE table_name = ? AND zoom_level = ?
  `);

  const row = stmt.value<
    [string, number, number, number, number, number, number, number]
  >(
    tableName,
    zoomLevel,
  );
  stmt.finalize();

  if (!row) {
    return undefined;
  }

  return {
    tableName: row[0],
    zoomLevel: row[1],
    matrixWidth: row[2],
    matrixHeight: row[3],
    tileWidth: row[4],
    tileHeight: row[5],
    pixelXSize: row[6],
    pixelYSize: row[7],
  };
}

/**
 * List all tile matrices for a table.
 */
export function listTileMatrices(
  db: Database,
  tableName: string,
): TileMatrix[] {
  validateTableName(tableName);

  const stmt = db.prepare(`
    SELECT table_name, zoom_level, matrix_width, matrix_height, tile_width, tile_height, pixel_x_size, pixel_y_size
    FROM gpkg_tile_matrix
    WHERE table_name = ?
    ORDER BY zoom_level
  `);

  const rows = stmt.values<
    [string, number, number, number, number, number, number, number]
  >(
    tableName,
  );
  stmt.finalize();

  return rows.map((row) => ({
    tableName: row[0],
    zoomLevel: row[1],
    matrixWidth: row[2],
    matrixHeight: row[3],
    tileWidth: row[4],
    tileHeight: row[5],
    pixelXSize: row[6],
    pixelYSize: row[7],
  }));
}

/**
 * Insert a tile into a tile pyramid table.
 */
export function insertTile(
  db: Database,
  tableName: string,
  tile: Omit<Tile, "id">,
): number {
  validateTableName(tableName);

  if (!isValidZoomLevel(tile.zoomLevel)) {
    throw new Error(`Invalid zoom level: ${tile.zoomLevel}`);
  }

  // Check if tile matrix exists for this zoom level
  const matrix = getTileMatrix(db, tableName, tile.zoomLevel);
  if (!matrix) {
    throw new Error(
      `Tile matrix for ${tableName} at zoom level ${tile.zoomLevel} not found`,
    );
  }

  // Validate tile coordinates
  if (
    tile.tileColumn < 0 || tile.tileColumn >= matrix.matrixWidth ||
    tile.tileRow < 0 || tile.tileRow >= matrix.matrixHeight
  ) {
    throw new Error(
      `Tile coordinates (${tile.tileColumn}, ${tile.tileRow}) out of bounds for zoom level ${tile.zoomLevel}`,
    );
  }

  const sql = `
    INSERT OR REPLACE INTO ${escapeIdentifier(tableName)} 
    (zoom_level, tile_column, tile_row, tile_data)
    VALUES (?, ?, ?, ?)
  `;

  const stmt = db.prepare(sql);
  stmt.run(tile.zoomLevel, tile.tileColumn, tile.tileRow, tile.tileData);
  stmt.finalize();

  const id = db.lastInsertRowId;

  // Update content timestamp
  updateContentTimestamp(db, tableName);

  return id;
}

/**
 * Get a tile by coordinates.
 */
export function getTile(
  db: Database,
  tableName: string,
  coords: { zoom: number; column: number; row: number },
): Tile | undefined {
  validateTableName(tableName);

  const sql = `
    SELECT id, zoom_level, tile_column, tile_row, tile_data
    FROM ${escapeIdentifier(tableName)}
    WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?
  `;

  const stmt = db.prepare(sql);
  const row = stmt.value<[number, number, number, number, Uint8Array]>(
    coords.zoom,
    coords.column,
    coords.row,
  );
  stmt.finalize();

  if (!row) {
    return undefined;
  }

  return {
    id: row[0],
    zoomLevel: row[1],
    tileColumn: row[2],
    tileRow: row[3],
    tileData: row[4],
  };
}

/**
 * Query tiles from a table.
 */
export function queryTiles(
  db: Database,
  tableName: string,
  options: TileQueryOptions = {},
): Tile[] {
  validateTableName(tableName);

  let sql = `SELECT id, zoom_level, tile_column, tile_row, tile_data FROM ${
    escapeIdentifier(tableName)
  }`;
  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (options.zoom !== undefined) {
    whereClauses.push("zoom_level = ?");
    params.push(options.zoom);
  }

  if (options.minColumn !== undefined) {
    whereClauses.push("tile_column >= ?");
    params.push(options.minColumn);
  }

  if (options.maxColumn !== undefined) {
    whereClauses.push("tile_column <= ?");
    params.push(options.maxColumn);
  }

  if (options.minRow !== undefined) {
    whereClauses.push("tile_row >= ?");
    params.push(options.minRow);
  }

  if (options.maxRow !== undefined) {
    whereClauses.push("tile_row <= ?");
    params.push(options.maxRow);
  }

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(" AND ")}`;
  }

  sql += " ORDER BY zoom_level, tile_column, tile_row";

  const stmt = db.prepare(sql);
  const rows = stmt.values<[number, number, number, number, Uint8Array]>(
    ...(params as []),
  );
  stmt.finalize();

  return rows.map((row) => ({
    id: row[0],
    zoomLevel: row[1],
    tileColumn: row[2],
    tileRow: row[3],
    tileData: row[4],
  }));
}

/**
 * Delete a tile.
 */
export function deleteTile(
  db: Database,
  tableName: string,
  coords: { zoom: number; column: number; row: number },
): void {
  validateTableName(tableName);

  const sql = `
    DELETE FROM ${escapeIdentifier(tableName)}
    WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?
  `;

  const stmt = db.prepare(sql);
  const changes = stmt.run(coords.zoom, coords.column, coords.row);
  stmt.finalize();

  if (changes === 0) {
    throw new Error(
      `Tile at zoom ${coords.zoom}, column ${coords.column}, row ${coords.row} not found`,
    );
  }

  // Update content timestamp
  updateContentTimestamp(db, tableName);
}

/**
 * Count tiles in a table.
 */
export function countTiles(
  db: Database,
  tableName: string,
  options: Pick<TileQueryOptions, "zoom"> = {},
): number {
  validateTableName(tableName);

  let sql = `SELECT COUNT(*) FROM ${escapeIdentifier(tableName)}`;

  if (options.zoom !== undefined) {
    sql += ` WHERE zoom_level = ${options.zoom}`;
  }

  const stmt = db.prepare(sql);
  const count = stmt.value<[number]>();
  stmt.finalize();

  return count?.[0] ?? 0;
}

/**
 * Get available zoom levels for a tile table.
 */
export function getAvailableZoomLevels(
  db: Database,
  tableName: string,
): number[] {
  validateTableName(tableName);

  const sql = `
    SELECT DISTINCT zoom_level 
    FROM ${escapeIdentifier(tableName)}
    ORDER BY zoom_level
  `;

  const stmt = db.prepare(sql);
  const rows = stmt.values<[number]>();
  stmt.finalize();

  return rows.map((row) => row[0]);
}
