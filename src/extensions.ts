/**
 * Extension management for GeoPackage.
 * @module
 */

import type { Database } from "@db/sqlite";
import type { Extension } from "./types.ts";
import { validateColumnName, validateTableName } from "./utils.ts";

/**
 * SQL for creating gpkg_extensions table.
 */
export const CREATE_EXTENSIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS gpkg_extensions (
  table_name TEXT,
  column_name TEXT,
  extension_name TEXT NOT NULL,
  definition TEXT NOT NULL,
  scope TEXT NOT NULL,
  CONSTRAINT ge_tce UNIQUE (table_name, column_name, extension_name)
);
`;

/**
 * Initialize gpkg_extensions table.
 */
export function initializeExtensionsTable(db: Database): void {
  db.exec(CREATE_EXTENSIONS_TABLE_SQL);
}

/**
 * Add an extension registration.
 */
export function addExtension(db: Database, extension: Extension): void {
  // Validate table name if provided
  if (extension.tableName) {
    validateTableName(extension.tableName);
  }

  // Validate column name if provided
  if (extension.columnName) {
    validateColumnName(extension.columnName);
  }

  // Validate scope
  if (!["read-write", "write-only"].includes(extension.scope)) {
    throw new Error(`Invalid extension scope: ${extension.scope}`);
  }

  // Check if extension already exists
  const existing = getExtension(
    db,
    extension.extensionName,
    extension.tableName ?? null,
    extension.columnName ?? null,
  );

  if (existing) {
    throw new Error(
      `Extension ${extension.extensionName} already registered for table ${
        extension.tableName ?? "database"
      }, column ${extension.columnName ?? "all"}`,
    );
  }

  const stmt = db.prepare(`
    INSERT INTO gpkg_extensions (table_name, column_name, extension_name, definition, scope)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    extension.tableName ?? null,
    extension.columnName ?? null,
    extension.extensionName,
    extension.definition,
    extension.scope,
  );

  stmt.finalize();
}

/**
 * Get an extension registration.
 */
export function getExtension(
  db: Database,
  extensionName: string,
  tableName: string | null = null,
  columnName: string | null = null,
): Extension | undefined {
  const stmt = db.prepare(`
    SELECT table_name, column_name, extension_name, definition, scope
    FROM gpkg_extensions
    WHERE extension_name = ? 
      AND (table_name IS ? OR (table_name IS NULL AND ? IS NULL))
      AND (column_name IS ? OR (column_name IS NULL AND ? IS NULL))
  `);

  const row = stmt.value<
    [string | null, string | null, string, string, string]
  >(
    extensionName,
    tableName,
    tableName,
    columnName,
    columnName,
  );
  stmt.finalize();

  if (!row) {
    return undefined;
  }

  return {
    tableName: row[0] ?? undefined,
    columnName: row[1] ?? undefined,
    extensionName: row[2],
    definition: row[3],
    scope: row[4] as "read-write" | "write-only",
  };
}

/**
 * List all extension registrations.
 */
export function listExtensions(db: Database): Extension[] {
  const stmt = db.prepare(`
    SELECT table_name, column_name, extension_name, definition, scope
    FROM gpkg_extensions
    ORDER BY extension_name, table_name, column_name
  `);

  const rows = stmt.values<
    [string | null, string | null, string, string, string]
  >();
  stmt.finalize();

  return rows.map((row) => ({
    tableName: row[0] ?? undefined,
    columnName: row[1] ?? undefined,
    extensionName: row[2],
    definition: row[3],
    scope: row[4] as "read-write" | "write-only",
  }));
}

/**
 * List extensions for a specific table.
 */
export function listTableExtensions(
  db: Database,
  tableName: string,
): Extension[] {
  validateTableName(tableName);

  const stmt = db.prepare(`
    SELECT table_name, column_name, extension_name, definition, scope
    FROM gpkg_extensions
    WHERE table_name = ?
    ORDER BY extension_name, column_name
  `);

  const rows = stmt.values<
    [string | null, string | null, string, string, string]
  >(tableName);
  stmt.finalize();

  return rows.map((row) => ({
    tableName: row[0] ?? undefined,
    columnName: row[1] ?? undefined,
    extensionName: row[2],
    definition: row[3],
    scope: row[4] as "read-write" | "write-only",
  }));
}

/**
 * List database-wide extensions (table_name is NULL).
 */
export function listDatabaseExtensions(db: Database): Extension[] {
  const stmt = db.prepare(`
    SELECT table_name, column_name, extension_name, definition, scope
    FROM gpkg_extensions
    WHERE table_name IS NULL
    ORDER BY extension_name
  `);

  const rows = stmt.values<
    [string | null, string | null, string, string, string]
  >();
  stmt.finalize();

  return rows.map((row) => ({
    tableName: row[0] ?? undefined,
    columnName: row[1] ?? undefined,
    extensionName: row[2],
    definition: row[3],
    scope: row[4] as "read-write" | "write-only",
  }));
}

/**
 * Check if an extension is registered.
 */
export function hasExtension(
  db: Database,
  extensionName: string,
  tableName: string | null = null,
  columnName: string | null = null,
): boolean {
  const stmt = db.prepare(`
    SELECT COUNT(*) 
    FROM gpkg_extensions
    WHERE extension_name = ?
      AND (? IS NULL OR table_name = ? OR table_name IS NULL)
      AND (? IS NULL OR column_name = ? OR column_name IS NULL)
  `);

  const count = stmt.value<[number]>(
    extensionName,
    tableName,
    tableName,
    columnName,
    columnName,
  );
  stmt.finalize();

  return count !== null && count !== undefined && count[0] > 0;
}

/**
 * Delete an extension registration.
 */
export function deleteExtension(
  db: Database,
  extensionName: string,
  tableName: string | null = null,
  columnName: string | null = null,
): void {
  const stmt = db.prepare(`
    DELETE FROM gpkg_extensions
    WHERE extension_name = ?
      AND (table_name IS ? OR (table_name IS NULL AND ? IS NULL))
      AND (column_name IS ? OR (column_name IS NULL AND ? IS NULL))
  `);

  const changes = stmt.run(
    extensionName,
    tableName,
    tableName,
    columnName,
    columnName,
  );
  stmt.finalize();

  if (changes === 0) {
    throw new Error(
      `Extension ${extensionName} not found for table ${
        tableName ?? "database"
      }, column ${columnName ?? "all"}`,
    );
  }
}

/**
 * Delete all extensions for a table.
 */
export function deleteTableExtensions(db: Database, tableName: string): void {
  validateTableName(tableName);

  const stmt = db.prepare(`
    DELETE FROM gpkg_extensions
    WHERE table_name = ?
  `);

  stmt.run(tableName);
  stmt.finalize();
}

/**
 * Common GeoPackage extension names.
 */
export const COMMON_EXTENSIONS = {
  /** R-tree spatial indexes */
  RTREE_INDEX: "gpkg_rtree_index",
  /** Geometry type triggers */
  GEOMETRY_TYPE_TRIGGERS: "gpkg_geometry_type_trigger",
  /** Geometry SRS ID triggers */
  GEOMETRY_SRS_ID_TRIGGERS: "gpkg_geometry_srs_id_trigger",
  /** Non-linear geometry types */
  NON_LINEAR_GEOMETRY_TYPES: "gpkg_geom_CIRCULARSTRING",
  /** WebP tile encoding */
  WEBP_TILES: "gpkg_webp",
  /** Metadata */
  METADATA: "gpkg_metadata",
  /** Schema */
  SCHEMA: "gpkg_schema",
  /** WKT for Coordinate Reference Systems */
  WKT_CRS: "gpkg_crs_wkt",
  /** Tiled gridded coverage data */
  TILED_GRIDDED_COVERAGE: "gpkg_2d_gridded_coverage",
  /** Related tables */
  RELATED_TABLES: "gpkg_related_tables",
} as const;
