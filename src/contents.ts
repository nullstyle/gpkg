/**
 * Contents table operations for GeoPackage.
 * @module
 */

import type { Database } from "@db/sqlite";
import type { BoundingBox, Content } from "./types.ts";
import { currentTimestamp, validateTableName } from "./utils.ts";
import { hasSpatialReferenceSystem } from "./srs.ts";

/**
 * SQL for creating gpkg_contents table.
 */
export const CREATE_CONTENTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS gpkg_contents (
  table_name TEXT NOT NULL PRIMARY KEY,
  data_type TEXT NOT NULL,
  identifier TEXT UNIQUE,
  description TEXT DEFAULT '',
  last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  min_x DOUBLE,
  min_y DOUBLE,
  max_x DOUBLE,
  max_y DOUBLE,
  srs_id INTEGER,
  CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
);
`;

/**
 * Initialize gpkg_contents table.
 */
export function initializeContentsTable(db: Database): void {
  db.exec(CREATE_CONTENTS_TABLE_SQL);
}

/**
 * Get content entry by table name.
 */
export function getContent(
  db: Database,
  tableName: string,
): Content | undefined {
  validateTableName(tableName);

  const stmt = db.prepare(`
    SELECT table_name, data_type, identifier, description, last_change,
           min_x, min_y, max_x, max_y, srs_id
    FROM gpkg_contents
    WHERE table_name = ?
  `);

  const row = stmt.value<
    [
      string,
      string,
      string | null,
      string | null,
      string,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
    ]
  >(tableName);
  stmt.finalize();

  if (!row) {
    return undefined;
  }

  const content: Content = {
    tableName: row[0],
    dataType: row[1] as "features" | "tiles" | "attributes",
    identifier: row[2] ?? undefined,
    description: row[3] ?? undefined,
    lastChange: row[4],
    srsId: row[9] ?? undefined,
  };

  if (
    row[5] !== null && row[6] !== null && row[7] !== null && row[8] !== null
  ) {
    content.bounds = {
      minX: row[5],
      minY: row[6],
      maxX: row[7],
      maxY: row[8],
    };
  }

  return content;
}

/**
 * List all content entries.
 */
export function listContents(db: Database): Content[] {
  const stmt = db.prepare(`
    SELECT table_name, data_type, identifier, description, last_change,
           min_x, min_y, max_x, max_y, srs_id
    FROM gpkg_contents
    ORDER BY table_name
  `);

  const rows = stmt.values<
    [
      string,
      string,
      string | null,
      string | null,
      string,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
    ]
  >();
  stmt.finalize();

  return rows.map((row) => {
    const content: Content = {
      tableName: row[0],
      dataType: row[1] as "features" | "tiles" | "attributes",
      identifier: row[2] ?? undefined,
      description: row[3] ?? undefined,
      lastChange: row[4],
      srsId: row[9] ?? undefined,
    };

    if (
      row[5] !== null && row[6] !== null && row[7] !== null && row[8] !== null
    ) {
      content.bounds = {
        minX: row[5],
        minY: row[6],
        maxX: row[7],
        maxY: row[8],
      };
    }

    return content;
  });
}

/**
 * List contents by data type.
 */
export function listContentsByType(
  db: Database,
  dataType: "features" | "tiles" | "attributes",
): Content[] {
  const stmt = db.prepare(`
    SELECT table_name, data_type, identifier, description, last_change,
           min_x, min_y, max_x, max_y, srs_id
    FROM gpkg_contents
    WHERE data_type = ?
    ORDER BY table_name
  `);

  const rows = stmt.values<
    [
      string,
      string,
      string | null,
      string | null,
      string,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
    ]
  >(dataType);
  stmt.finalize();

  return rows.map((row) => {
    const content: Content = {
      tableName: row[0],
      dataType: row[1] as "features" | "tiles" | "attributes",
      identifier: row[2] ?? undefined,
      description: row[3] ?? undefined,
      lastChange: row[4],
      srsId: row[9] ?? undefined,
    };

    if (
      row[5] !== null && row[6] !== null && row[7] !== null && row[8] !== null
    ) {
      content.bounds = {
        minX: row[5],
        minY: row[6],
        maxX: row[7],
        maxY: row[8],
      };
    }

    return content;
  });
}

/**
 * Add a new content entry.
 */
export function addContent(db: Database, content: Content): void {
  validateTableName(content.tableName);

  // Validate data type
  if (!["features", "tiles", "attributes"].includes(content.dataType)) {
    throw new Error(`Invalid data type: ${content.dataType}`);
  }

  // Validate SRS ID if provided
  if (
    content.srsId !== undefined && !hasSpatialReferenceSystem(db, content.srsId)
  ) {
    throw new Error(`SRS ID ${content.srsId} not found`);
  }

  // Check if content already exists
  const existing = getContent(db, content.tableName);
  if (existing) {
    throw new Error(`Content for table ${content.tableName} already exists`);
  }

  const stmt = db.prepare(`
    INSERT INTO gpkg_contents
    (table_name, data_type, identifier, description, last_change,
     min_x, min_y, max_x, max_y, srs_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const bounds = content.bounds;
  stmt.run(
    content.tableName,
    content.dataType,
    content.identifier ?? null,
    content.description ?? "",
    content.lastChange ?? currentTimestamp(),
    bounds?.minX ?? null,
    bounds?.minY ?? null,
    bounds?.maxX ?? null,
    bounds?.maxY ?? null,
    content.srsId ?? null,
  );

  stmt.finalize();
}

/**
 * Update an existing content entry.
 */
export function updateContent(db: Database, content: Content): void {
  validateTableName(content.tableName);

  // Validate SRS ID if provided
  if (
    content.srsId !== undefined && !hasSpatialReferenceSystem(db, content.srsId)
  ) {
    throw new Error(`SRS ID ${content.srsId} not found`);
  }

  const stmt = db.prepare(`
    UPDATE gpkg_contents
    SET data_type = ?, identifier = ?, description = ?, last_change = ?,
        min_x = ?, min_y = ?, max_x = ?, max_y = ?, srs_id = ?
    WHERE table_name = ?
  `);

  const bounds = content.bounds;
  const changes = stmt.run(
    content.dataType,
    content.identifier ?? null,
    content.description ?? "",
    content.lastChange ?? currentTimestamp(),
    bounds?.minX ?? null,
    bounds?.minY ?? null,
    bounds?.maxX ?? null,
    bounds?.maxY ?? null,
    content.srsId ?? null,
    content.tableName,
  );

  stmt.finalize();

  if (changes === 0) {
    throw new Error(`Content for table ${content.tableName} not found`);
  }
}

/**
 * Update the last_change timestamp for a content entry.
 */
export function updateContentTimestamp(db: Database, tableName: string): void {
  validateTableName(tableName);

  const stmt = db.prepare(`
    UPDATE gpkg_contents
    SET last_change = ?
    WHERE table_name = ?
  `);

  stmt.run(currentTimestamp(), tableName);
  stmt.finalize();
}

/**
 * Update the bounding box for a content entry.
 */
export function updateContentBounds(
  db: Database,
  tableName: string,
  bounds: BoundingBox,
): void {
  validateTableName(tableName);

  const stmt = db.prepare(`
    UPDATE gpkg_contents
    SET min_x = ?, min_y = ?, max_x = ?, max_y = ?, last_change = ?
    WHERE table_name = ?
  `);

  stmt.run(
    bounds.minX,
    bounds.minY,
    bounds.maxX,
    bounds.maxY,
    currentTimestamp(),
    tableName,
  );

  stmt.finalize();
}

/**
 * Delete a content entry.
 */
export function deleteContent(db: Database, tableName: string): void {
  validateTableName(tableName);

  const stmt = db.prepare(`
    DELETE FROM gpkg_contents
    WHERE table_name = ?
  `);

  const changes = stmt.run(tableName);
  stmt.finalize();

  if (changes === 0) {
    throw new Error(`Content for table ${tableName} not found`);
  }
}

/**
 * Check if a content entry exists.
 */
export function hasContent(db: Database, tableName: string): boolean {
  validateTableName(tableName);

  const stmt = db.prepare(`
    SELECT COUNT(*) FROM gpkg_contents WHERE table_name = ?
  `);

  const count = stmt.value<[number]>(tableName);
  stmt.finalize();

  return count !== null && count !== undefined && count[0] > 0;
}
