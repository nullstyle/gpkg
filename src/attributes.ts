/**
 * Attribute table operations for GeoPackage.
 * Attribute tables are non-spatial tables for storing tabular data.
 * @module
 */

import type { Database } from "@db/sqlite";
import type {
  AttributeTableConfig,
  ColumnDefinition,
  WhereClause,
} from "./types.ts";
import {
  escapeIdentifier,
  validateColumnName,
  validateTableName,
} from "./utils.ts";
import { addContent, hasContent, updateContentTimestamp } from "./contents.ts";

/**
 * Create an attribute table (non-spatial table).
 */
export function createAttributeTable(
  db: Database,
  config: AttributeTableConfig,
): void {
  validateTableName(config.tableName);

  // Check if table already exists
  if (hasContent(db, config.tableName)) {
    throw new Error(`Table ${config.tableName} already exists`);
  }

  // Build CREATE TABLE statement
  const columns: string[] = [];

  // Ensure there's a primary key
  const hasPrimaryKey = config.columns?.some((col) => col.primaryKey);
  if (!hasPrimaryKey) {
    columns.push("id INTEGER PRIMARY KEY AUTOINCREMENT");
  }

  // Add user-defined columns
  if (config.columns) {
    for (const col of config.columns) {
      validateColumnName(col.name);
      columns.push(buildColumnDefinition(col));
    }
  }

  if (columns.length === 0) {
    throw new Error(
      "Attribute table must have at least one column (besides auto-generated id)",
    );
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
    dataType: "attributes",
    identifier: config.identifier ?? config.tableName,
    description: config.description,
  });
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
 * Attribute row with id and properties.
 */
export interface AttributeRow<T = Record<string, unknown>> {
  /** Row ID */
  id?: number;
  /** Row properties/values */
  properties: T;
}

/**
 * Query options for attributes.
 */
export interface AttributeQueryOptions {
  /** WHERE clause with parameterized SQL */
  where?: WhereClause;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** ORDER BY clause */
  orderBy?: string;
}

/**
 * Check if a table is an attribute table.
 */
export function isAttributeTable(db: Database, tableName: string): boolean {
  validateTableName(tableName);

  const stmt = db.prepare(`
    SELECT data_type FROM gpkg_contents WHERE table_name = ?
  `);
  const row = stmt.value<[string]>(tableName);
  stmt.finalize();

  return row?.[0] === "attributes";
}

/**
 * Insert a row into an attribute table.
 */
export function insertAttribute<T = Record<string, unknown>>(
  db: Database,
  tableName: string,
  row: Omit<AttributeRow<T>, "id">,
): number {
  validateTableName(tableName);

  if (!isAttributeTable(db, tableName)) {
    throw new Error(`Table ${tableName} is not an attribute table`);
  }

  // Build INSERT statement
  const columns: string[] = [];
  const placeholders: string[] = [];
  const values: unknown[] = [];

  for (
    const [key, value] of Object.entries(
      row.properties as Record<string, unknown>,
    )
  ) {
    columns.push(escapeIdentifier(key));
    placeholders.push("?");
    values.push(value);
  }

  if (columns.length === 0) {
    throw new Error("Cannot insert empty row");
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
 * Get an attribute row by ID.
 */
export function getAttribute<T = Record<string, unknown>>(
  db: Database,
  tableName: string,
  id: number,
): AttributeRow<T> | undefined {
  validateTableName(tableName);

  if (!isAttributeTable(db, tableName)) {
    throw new Error(`Table ${tableName} is not an attribute table`);
  }

  const sql = `SELECT * FROM ${escapeIdentifier(tableName)} WHERE id = ?`;
  const stmt = db.prepare(sql);
  const row = stmt.get<Record<string, unknown>>(id);
  stmt.finalize();

  if (!row) {
    return undefined;
  }

  return rowToAttribute(row);
}

/**
 * Query rows from an attribute table.
 */
export function queryAttributes<T = Record<string, unknown>>(
  db: Database,
  tableName: string,
  options: AttributeQueryOptions = {},
): AttributeRow<T>[] {
  validateTableName(tableName);

  if (!isAttributeTable(db, tableName)) {
    throw new Error(`Table ${tableName} is not an attribute table`);
  }

  // Build query
  let sql = `SELECT * FROM ${escapeIdentifier(tableName)}`;
  const params: unknown[] = [];

  // WHERE clause
  if (options.where) {
    sql += ` WHERE ${options.where.sql}`;
    params.push(...options.where.params);
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

  return rows.map((row) => rowToAttribute(row));
}

/**
 * Update an attribute row.
 */
export function updateAttribute<T = Record<string, unknown>>(
  db: Database,
  tableName: string,
  id: number,
  updates: Partial<T>,
): void {
  validateTableName(tableName);

  if (!isAttributeTable(db, tableName)) {
    throw new Error(`Table ${tableName} is not an attribute table`);
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (
    const [key, value] of Object.entries(updates as Record<string, unknown>)
  ) {
    setClauses.push(`${escapeIdentifier(key)} = ?`);
    values.push(value);
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
    throw new Error(`Row with ID ${id} not found in table ${tableName}`);
  }

  // Update content timestamp
  updateContentTimestamp(db, tableName);
}

/**
 * Delete an attribute row.
 */
export function deleteAttribute(
  db: Database,
  tableName: string,
  id: number,
): void {
  validateTableName(tableName);

  if (!isAttributeTable(db, tableName)) {
    throw new Error(`Table ${tableName} is not an attribute table`);
  }

  const sql = `DELETE FROM ${escapeIdentifier(tableName)} WHERE id = ?`;
  const stmt = db.prepare(sql);
  const changes = stmt.run(id);
  stmt.finalize();

  if (changes === 0) {
    throw new Error(`Row with ID ${id} not found in table ${tableName}`);
  }

  // Update content timestamp
  updateContentTimestamp(db, tableName);
}

/**
 * Count rows in an attribute table.
 */
export function countAttributes(
  db: Database,
  tableName: string,
  options: Pick<AttributeQueryOptions, "where"> = {},
): number {
  validateTableName(tableName);

  if (!isAttributeTable(db, tableName)) {
    throw new Error(`Table ${tableName} is not an attribute table`);
  }

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
 * Convert database row to AttributeRow object.
 */
function rowToAttribute<T = Record<string, unknown>>(
  row: Record<string, unknown>,
): AttributeRow<T> {
  const { id, ...properties } = row;
  return {
    id: id as number | undefined,
    properties: properties as T,
  };
}
