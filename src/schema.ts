/**
 * Schema extension for GeoPackage (gpkg_data_columns).
 * Provides metadata about columns including titles, descriptions, and constraints.
 * @module
 */

import type { Database } from "@db/sqlite";
import { validateColumnName, validateTableName } from "./utils.ts";
import { hasContent } from "./contents.ts";
import { addExtension, hasExtension } from "./extensions.ts";
import { COMMON_EXTENSIONS } from "./extensions.ts";

/**
 * SQL for creating gpkg_data_columns table.
 */
export const CREATE_DATA_COLUMNS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS gpkg_data_columns (
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  name TEXT,
  title TEXT,
  description TEXT,
  mime_type TEXT,
  constraint_name TEXT,
  CONSTRAINT pk_gdc PRIMARY KEY (table_name, column_name),
  CONSTRAINT fk_gdc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name)
);
`;

/**
 * SQL for creating gpkg_data_column_constraints table.
 */
export const CREATE_DATA_COLUMN_CONSTRAINTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS gpkg_data_column_constraints (
  constraint_name TEXT NOT NULL,
  constraint_type TEXT NOT NULL,
  value TEXT,
  min NUMERIC,
  min_is_inclusive INTEGER,
  max NUMERIC,
  max_is_inclusive INTEGER,
  description TEXT,
  CONSTRAINT gdcc_ntv UNIQUE (constraint_name, constraint_type, value)
);
`;

/**
 * Data column metadata definition.
 */
export interface DataColumn {
  /** Table name */
  tableName: string;
  /** Column name */
  columnName: string;
  /** A human-readable identifier (e.g. short name) */
  name?: string;
  /** A human-readable formal title */
  title?: string;
  /** A human-readable description */
  description?: string;
  /** MIME type of column values (for BLOB columns) */
  mimeType?: string;
  /** Name of constraint to apply to column values */
  constraintName?: string;
}

/**
 * Constraint type for data column constraints.
 */
export type ConstraintType = "range" | "enum" | "glob";

/**
 * Base constraint definition.
 */
export interface BaseConstraint {
  /** Constraint name (identifier) */
  constraintName: string;
  /** Constraint type */
  constraintType: ConstraintType;
  /** Human-readable description */
  description?: string;
}

/**
 * Range constraint definition.
 */
export interface RangeConstraint extends BaseConstraint {
  constraintType: "range";
  /** Minimum value */
  min?: number;
  /** Whether minimum is inclusive (default: true) */
  minIsInclusive?: boolean;
  /** Maximum value */
  max?: number;
  /** Whether maximum is inclusive (default: true) */
  maxIsInclusive?: boolean;
}

/**
 * Enum constraint definition (single allowed value).
 */
export interface EnumConstraint extends BaseConstraint {
  constraintType: "enum";
  /** Allowed value */
  value: string;
}

/**
 * Glob constraint definition (pattern matching).
 */
export interface GlobConstraint extends BaseConstraint {
  constraintType: "glob";
  /** Glob pattern to match */
  value: string;
}

/**
 * Union type for all constraint types.
 */
export type DataColumnConstraint =
  | RangeConstraint
  | EnumConstraint
  | GlobConstraint;

/**
 * Initialize schema extension tables.
 */
export function initializeSchemaExtensionTables(db: Database): void {
  db.exec(CREATE_DATA_COLUMNS_TABLE_SQL);
  db.exec(CREATE_DATA_COLUMN_CONSTRAINTS_TABLE_SQL);
}

/**
 * Register the schema extension for a table.
 */
function registerSchemaExtension(
  db: Database,
  tableName: string,
  columnName: string,
): void {
  if (!hasExtension(db, COMMON_EXTENSIONS.SCHEMA, tableName, columnName)) {
    addExtension(db, {
      tableName,
      columnName,
      extensionName: COMMON_EXTENSIONS.SCHEMA,
      definition: "http://www.geopackage.org/spec120/#extension_schema",
      scope: "read-write",
    });
  }
}

// ============== Data Columns ==============

/**
 * Add a data column definition.
 */
export function addDataColumn(db: Database, column: DataColumn): void {
  validateTableName(column.tableName);
  validateColumnName(column.columnName);

  // Verify table exists in gpkg_contents
  if (!hasContent(db, column.tableName)) {
    throw new Error(`Table ${column.tableName} not found in gpkg_contents`);
  }

  // Check if column definition already exists
  if (hasDataColumn(db, column.tableName, column.columnName)) {
    throw new Error(
      `Data column definition already exists for ${column.tableName}.${column.columnName}`,
    );
  }

  // Verify constraint exists if specified
  if (column.constraintName && !hasConstraint(db, column.constraintName)) {
    throw new Error(`Constraint ${column.constraintName} not found`);
  }

  const stmt = db.prepare(`
    INSERT INTO gpkg_data_columns
    (table_name, column_name, name, title, description, mime_type, constraint_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    column.tableName,
    column.columnName,
    column.name ?? null,
    column.title ?? null,
    column.description ?? null,
    column.mimeType ?? null,
    column.constraintName ?? null,
  );

  stmt.finalize();

  // Register the schema extension
  registerSchemaExtension(db, column.tableName, column.columnName);
}

/**
 * Get a data column definition.
 */
export function getDataColumn(
  db: Database,
  tableName: string,
  columnName: string,
): DataColumn | undefined {
  validateTableName(tableName);
  validateColumnName(columnName);

  const stmt = db.prepare(`
    SELECT table_name, column_name, name, title, description, mime_type, constraint_name
    FROM gpkg_data_columns
    WHERE table_name = ? AND column_name = ?
  `);

  const row = stmt.value<
    [
      string,
      string,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
    ]
  >(tableName, columnName);
  stmt.finalize();

  if (!row) {
    return undefined;
  }

  return rowToDataColumn(row);
}

/**
 * List all data column definitions for a table.
 */
export function listDataColumns(db: Database, tableName: string): DataColumn[] {
  validateTableName(tableName);

  const stmt = db.prepare(`
    SELECT table_name, column_name, name, title, description, mime_type, constraint_name
    FROM gpkg_data_columns
    WHERE table_name = ?
    ORDER BY column_name
  `);

  const rows = stmt.values<
    [
      string,
      string,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
    ]
  >(tableName);
  stmt.finalize();

  return rows.map(rowToDataColumn);
}

/**
 * List all data column definitions.
 */
export function listAllDataColumns(db: Database): DataColumn[] {
  const stmt = db.prepare(`
    SELECT table_name, column_name, name, title, description, mime_type, constraint_name
    FROM gpkg_data_columns
    ORDER BY table_name, column_name
  `);

  const rows = stmt.values<
    [
      string,
      string,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
    ]
  >();
  stmt.finalize();

  return rows.map(rowToDataColumn);
}

/**
 * Update a data column definition.
 */
export function updateDataColumn(db: Database, column: DataColumn): void {
  validateTableName(column.tableName);
  validateColumnName(column.columnName);

  // Verify constraint exists if specified
  if (column.constraintName && !hasConstraint(db, column.constraintName)) {
    throw new Error(`Constraint ${column.constraintName} not found`);
  }

  const stmt = db.prepare(`
    UPDATE gpkg_data_columns
    SET name = ?, title = ?, description = ?, mime_type = ?, constraint_name = ?
    WHERE table_name = ? AND column_name = ?
  `);

  const changes = stmt.run(
    column.name ?? null,
    column.title ?? null,
    column.description ?? null,
    column.mimeType ?? null,
    column.constraintName ?? null,
    column.tableName,
    column.columnName,
  );

  stmt.finalize();

  if (changes === 0) {
    throw new Error(
      `Data column definition not found for ${column.tableName}.${column.columnName}`,
    );
  }
}

/**
 * Delete a data column definition.
 */
export function deleteDataColumn(
  db: Database,
  tableName: string,
  columnName: string,
): void {
  validateTableName(tableName);
  validateColumnName(columnName);

  const stmt = db.prepare(`
    DELETE FROM gpkg_data_columns
    WHERE table_name = ? AND column_name = ?
  `);

  const changes = stmt.run(tableName, columnName);
  stmt.finalize();

  if (changes === 0) {
    throw new Error(
      `Data column definition not found for ${tableName}.${columnName}`,
    );
  }
}

/**
 * Delete all data column definitions for a table.
 */
export function deleteTableDataColumns(db: Database, tableName: string): void {
  validateTableName(tableName);

  const stmt = db.prepare(`
    DELETE FROM gpkg_data_columns
    WHERE table_name = ?
  `);

  stmt.run(tableName);
  stmt.finalize();
}

/**
 * Check if a data column definition exists.
 */
export function hasDataColumn(
  db: Database,
  tableName: string,
  columnName: string,
): boolean {
  validateTableName(tableName);
  validateColumnName(columnName);

  const stmt = db.prepare(`
    SELECT COUNT(*) FROM gpkg_data_columns
    WHERE table_name = ? AND column_name = ?
  `);

  const count = stmt.value<[number]>(tableName, columnName);
  stmt.finalize();

  return count !== null && count !== undefined && count[0] > 0;
}

/**
 * Convert database row to DataColumn object.
 */
function rowToDataColumn(
  row: [
    string,
    string,
    string | null,
    string | null,
    string | null,
    string | null,
    string | null,
  ],
): DataColumn {
  return {
    tableName: row[0],
    columnName: row[1],
    name: row[2] ?? undefined,
    title: row[3] ?? undefined,
    description: row[4] ?? undefined,
    mimeType: row[5] ?? undefined,
    constraintName: row[6] ?? undefined,
  };
}

// ============== Data Column Constraints ==============

/**
 * Add a range constraint.
 */
export function addRangeConstraint(
  db: Database,
  constraint: Omit<RangeConstraint, "constraintType">,
): void {
  if (constraint.min === undefined && constraint.max === undefined) {
    throw new Error("Range constraint must have at least min or max value");
  }

  const stmt = db.prepare(`
    INSERT INTO gpkg_data_column_constraints
    (constraint_name, constraint_type, value, min, min_is_inclusive, max, max_is_inclusive, description)
    VALUES (?, 'range', NULL, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    constraint.constraintName,
    constraint.min ?? null,
    constraint.minIsInclusive !== false ? 1 : 0,
    constraint.max ?? null,
    constraint.maxIsInclusive !== false ? 1 : 0,
    constraint.description ?? null,
  );

  stmt.finalize();
}

/**
 * Add an enum constraint value.
 * Multiple values can be added with the same constraint name to create an enumeration.
 */
export function addEnumConstraint(
  db: Database,
  constraint: Omit<EnumConstraint, "constraintType">,
): void {
  if (!constraint.value) {
    throw new Error("Enum constraint must have a value");
  }

  const stmt = db.prepare(`
    INSERT INTO gpkg_data_column_constraints
    (constraint_name, constraint_type, value, min, min_is_inclusive, max, max_is_inclusive, description)
    VALUES (?, 'enum', ?, NULL, NULL, NULL, NULL, ?)
  `);

  stmt.run(
    constraint.constraintName,
    constraint.value,
    constraint.description ?? null,
  );

  stmt.finalize();
}

/**
 * Add a glob constraint (pattern matching).
 */
export function addGlobConstraint(
  db: Database,
  constraint: Omit<GlobConstraint, "constraintType">,
): void {
  if (!constraint.value) {
    throw new Error("Glob constraint must have a pattern value");
  }

  const stmt = db.prepare(`
    INSERT INTO gpkg_data_column_constraints
    (constraint_name, constraint_type, value, min, min_is_inclusive, max, max_is_inclusive, description)
    VALUES (?, 'glob', ?, NULL, NULL, NULL, NULL, ?)
  `);

  stmt.run(
    constraint.constraintName,
    constraint.value,
    constraint.description ?? null,
  );

  stmt.finalize();
}

/**
 * Get all constraints with a given name.
 */
export function getConstraints(
  db: Database,
  constraintName: string,
): DataColumnConstraint[] {
  const stmt = db.prepare(`
    SELECT constraint_name, constraint_type, value, min, min_is_inclusive, max, max_is_inclusive, description
    FROM gpkg_data_column_constraints
    WHERE constraint_name = ?
    ORDER BY constraint_type, value
  `);

  const rows = stmt.values<
    [
      string,
      string,
      string | null,
      number | null,
      number | null,
      number | null,
      number | null,
      string | null,
    ]
  >(constraintName);
  stmt.finalize();

  return rows.map(rowToConstraint);
}

/**
 * Get enum values for a constraint.
 */
export function getEnumValues(db: Database, constraintName: string): string[] {
  const stmt = db.prepare(`
    SELECT value FROM gpkg_data_column_constraints
    WHERE constraint_name = ? AND constraint_type = 'enum'
    ORDER BY value
  `);

  const rows = stmt.values<[string]>(constraintName);
  stmt.finalize();

  return rows.map((row) => row[0]);
}

/**
 * Get range constraint for a constraint name.
 */
export function getRangeConstraint(
  db: Database,
  constraintName: string,
): RangeConstraint | undefined {
  const stmt = db.prepare(`
    SELECT constraint_name, constraint_type, value, min, min_is_inclusive, max, max_is_inclusive, description
    FROM gpkg_data_column_constraints
    WHERE constraint_name = ? AND constraint_type = 'range'
  `);

  const row = stmt.value<
    [
      string,
      string,
      string | null,
      number | null,
      number | null,
      number | null,
      number | null,
      string | null,
    ]
  >(constraintName);
  stmt.finalize();

  if (!row) {
    return undefined;
  }

  return rowToConstraint(row) as RangeConstraint;
}

/**
 * List all constraint names.
 */
export function listConstraintNames(db: Database): string[] {
  const stmt = db.prepare(`
    SELECT DISTINCT constraint_name
    FROM gpkg_data_column_constraints
    ORDER BY constraint_name
  `);

  const rows = stmt.values<[string]>();
  stmt.finalize();

  return rows.map((row) => row[0]);
}

/**
 * Delete a constraint by name.
 * Removes all constraint entries with this name.
 */
export function deleteConstraint(db: Database, constraintName: string): void {
  // Check if any data columns reference this constraint
  const checkStmt = db.prepare(`
    SELECT COUNT(*) FROM gpkg_data_columns
    WHERE constraint_name = ?
  `);
  const count = checkStmt.value<[number]>(constraintName);
  checkStmt.finalize();

  if (count && count[0] > 0) {
    throw new Error(
      `Cannot delete constraint ${constraintName}: it is referenced by ${
        count[0]
      } data column(s)`,
    );
  }

  const stmt = db.prepare(`
    DELETE FROM gpkg_data_column_constraints
    WHERE constraint_name = ?
  `);

  const changes = stmt.run(constraintName);
  stmt.finalize();

  if (changes === 0) {
    throw new Error(`Constraint ${constraintName} not found`);
  }
}

/**
 * Delete a specific enum value from a constraint.
 */
export function deleteEnumValue(
  db: Database,
  constraintName: string,
  value: string,
): void {
  const stmt = db.prepare(`
    DELETE FROM gpkg_data_column_constraints
    WHERE constraint_name = ? AND constraint_type = 'enum' AND value = ?
  `);

  const changes = stmt.run(constraintName, value);
  stmt.finalize();

  if (changes === 0) {
    throw new Error(
      `Enum value '${value}' not found in constraint ${constraintName}`,
    );
  }
}

/**
 * Check if a constraint exists.
 */
export function hasConstraint(db: Database, constraintName: string): boolean {
  const stmt = db.prepare(`
    SELECT COUNT(*) FROM gpkg_data_column_constraints
    WHERE constraint_name = ?
  `);

  const count = stmt.value<[number]>(constraintName);
  stmt.finalize();

  return count !== null && count !== undefined && count[0] > 0;
}

/**
 * Convert database row to constraint object.
 */
function rowToConstraint(
  row: [
    string,
    string,
    string | null,
    number | null,
    number | null,
    number | null,
    number | null,
    string | null,
  ],
): DataColumnConstraint {
  const constraintType = row[1] as ConstraintType;

  switch (constraintType) {
    case "range":
      return {
        constraintName: row[0],
        constraintType: "range",
        min: row[3] ?? undefined,
        minIsInclusive: row[4] === null ? undefined : row[4] === 1,
        max: row[5] ?? undefined,
        maxIsInclusive: row[6] === null ? undefined : row[6] === 1,
        description: row[7] ?? undefined,
      };
    case "enum":
      return {
        constraintName: row[0],
        constraintType: "enum",
        value: row[2]!,
        description: row[7] ?? undefined,
      };
    case "glob":
      return {
        constraintName: row[0],
        constraintType: "glob",
        value: row[2]!,
        description: row[7] ?? undefined,
      };
    default:
      throw new Error(`Unknown constraint type: ${constraintType}`);
  }
}

// ============== Validation Helpers ==============

/**
 * Validate a value against a column's constraints.
 * Returns true if valid, throws an error if invalid.
 */
export function validateValueAgainstConstraint(
  db: Database,
  constraintName: string,
  value: unknown,
): boolean {
  const constraints = getConstraints(db, constraintName);

  if (constraints.length === 0) {
    throw new Error(`Constraint ${constraintName} not found`);
  }

  // Group by type
  const rangeConstraints = constraints.filter(
    (c) => c.constraintType === "range",
  ) as RangeConstraint[];
  const enumConstraints = constraints.filter(
    (c) => c.constraintType === "enum",
  ) as EnumConstraint[];
  const globConstraints = constraints.filter(
    (c) => c.constraintType === "glob",
  ) as GlobConstraint[];

  // Check range constraints
  for (const constraint of rangeConstraints) {
    if (typeof value !== "number") {
      throw new Error(
        `Value must be a number for range constraint ${constraintName}`,
      );
    }

    if (constraint.min !== undefined) {
      if (constraint.minIsInclusive !== false) {
        if (value < constraint.min) {
          throw new Error(
            `Value ${value} is less than minimum ${constraint.min}`,
          );
        }
      } else {
        if (value <= constraint.min) {
          throw new Error(
            `Value ${value} must be greater than ${constraint.min}`,
          );
        }
      }
    }

    if (constraint.max !== undefined) {
      if (constraint.maxIsInclusive !== false) {
        if (value > constraint.max) {
          throw new Error(
            `Value ${value} is greater than maximum ${constraint.max}`,
          );
        }
      } else {
        if (value >= constraint.max) {
          throw new Error(
            `Value ${value} must be less than ${constraint.max}`,
          );
        }
      }
    }
  }

  // Check enum constraints
  if (enumConstraints.length > 0) {
    const allowedValues = enumConstraints.map((c) => c.value);
    const stringValue = String(value);
    if (!allowedValues.includes(stringValue)) {
      throw new Error(
        `Value '${stringValue}' is not in allowed values: ${
          allowedValues.join(", ")
        }`,
      );
    }
  }

  // Check glob constraints
  for (const constraint of globConstraints) {
    const stringValue = String(value);
    const pattern = constraint.value;
    // Convert glob pattern to regex
    const regex = globToRegex(pattern);
    if (!regex.test(stringValue)) {
      throw new Error(
        `Value '${stringValue}' does not match pattern '${pattern}'`,
      );
    }
  }

  return true;
}

/**
 * Convert a glob pattern to a regular expression.
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${pattern}$`);
}
