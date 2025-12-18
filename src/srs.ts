/**
 * Spatial Reference System operations for GeoPackage.
 * @module
 */

import type { Database } from "@db/sqlite";
import type { SpatialReferenceSystem } from "./types.ts";
import { isValidSrsId } from "./utils.ts";

/**
 * SQL for creating gpkg_spatial_ref_sys table.
 */
export const CREATE_SRS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS gpkg_spatial_ref_sys (
  srs_name TEXT NOT NULL,
  srs_id INTEGER NOT NULL PRIMARY KEY,
  organization TEXT NOT NULL,
  organization_coordsys_id INTEGER NOT NULL,
  definition TEXT NOT NULL,
  description TEXT
);
`;

/**
 * Default spatial reference systems required by GeoPackage spec.
 */
export const DEFAULT_SRS: SpatialReferenceSystem[] = [
  {
    srsName: "WGS 84",
    srsId: 4326,
    organization: "EPSG",
    organizationCoordsysId: 4326,
    definition:
      `GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]`,
    description: "WGS 84 geographic 2D CRS",
  },
  {
    srsName: "WGS 84 / Pseudo-Mercator",
    srsId: 3857,
    organization: "EPSG",
    organizationCoordsysId: 3857,
    definition:
      `PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]],PROJECTION["Mercator_1SP"],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["X",EAST],AXIS["Y",NORTH],EXTENSION["PROJ4","+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs"],AUTHORITY["EPSG","3857"]]`,
    description: "WGS 84 / Pseudo-Mercator (Web Mercator)",
  },
  {
    srsName: "Undefined Cartesian SRS",
    srsId: -1,
    organization: "NONE",
    organizationCoordsysId: -1,
    definition: "undefined",
    description: "Undefined Cartesian coordinate reference system",
  },
  {
    srsName: "Undefined Geographic SRS",
    srsId: 0,
    organization: "NONE",
    organizationCoordsysId: 0,
    definition: "undefined",
    description: "Undefined geographic coordinate reference system",
  },
];

/**
 * Initialize gpkg_spatial_ref_sys table with required SRS.
 */
export function initializeSrsTable(db: Database): void {
  db.exec(CREATE_SRS_TABLE_SQL);

  // Insert default SRS if they don't exist
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO gpkg_spatial_ref_sys 
    (srs_name, srs_id, organization, organization_coordsys_id, definition, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const srs of DEFAULT_SRS) {
    insertStmt.run(
      srs.srsName,
      srs.srsId,
      srs.organization,
      srs.organizationCoordsysId,
      srs.definition,
      srs.description ?? null,
    );
  }

  insertStmt.finalize();
}

/**
 * Get spatial reference system by ID.
 */
export function getSpatialReferenceSystem(
  db: Database,
  srsId: number,
): SpatialReferenceSystem | undefined {
  if (!isValidSrsId(srsId)) {
    throw new Error(`Invalid SRS ID: ${srsId}`);
  }

  const stmt = db.prepare(`
    SELECT srs_name, srs_id, organization, organization_coordsys_id, definition, description
    FROM gpkg_spatial_ref_sys
    WHERE srs_id = ?
  `);

  const row = stmt.value<
    [string, number, string, number, string, string | null]
  >(srsId);
  stmt.finalize();

  if (!row) {
    return undefined;
  }

  return {
    srsName: row[0],
    srsId: row[1],
    organization: row[2],
    organizationCoordsysId: row[3],
    definition: row[4],
    description: row[5] ?? undefined,
  };
}

/**
 * List all spatial reference systems.
 */
export function listSpatialReferenceSystems(
  db: Database,
): SpatialReferenceSystem[] {
  const stmt = db.prepare(`
    SELECT srs_name, srs_id, organization, organization_coordsys_id, definition, description
    FROM gpkg_spatial_ref_sys
    ORDER BY srs_id
  `);

  const rows = stmt.values<
    [string, number, string, number, string, string | null]
  >();
  stmt.finalize();

  return rows.map((row) => ({
    srsName: row[0],
    srsId: row[1],
    organization: row[2],
    organizationCoordsysId: row[3],
    definition: row[4],
    description: row[5] ?? undefined,
  }));
}

/**
 * Add a new spatial reference system.
 */
export function addSpatialReferenceSystem(
  db: Database,
  srs: SpatialReferenceSystem,
): void {
  if (!isValidSrsId(srs.srsId)) {
    throw new Error(`Invalid SRS ID: ${srs.srsId}`);
  }

  // Check if SRS already exists
  const existing = getSpatialReferenceSystem(db, srs.srsId);
  if (existing) {
    throw new Error(`SRS with ID ${srs.srsId} already exists`);
  }

  const stmt = db.prepare(`
    INSERT INTO gpkg_spatial_ref_sys 
    (srs_name, srs_id, organization, organization_coordsys_id, definition, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    srs.srsName,
    srs.srsId,
    srs.organization,
    srs.organizationCoordsysId,
    srs.definition,
    srs.description ?? null,
  );

  stmt.finalize();
}

/**
 * Update an existing spatial reference system.
 */
export function updateSpatialReferenceSystem(
  db: Database,
  srs: SpatialReferenceSystem,
): void {
  if (!isValidSrsId(srs.srsId)) {
    throw new Error(`Invalid SRS ID: ${srs.srsId}`);
  }

  const stmt = db.prepare(`
    UPDATE gpkg_spatial_ref_sys
    SET srs_name = ?, organization = ?, organization_coordsys_id = ?, 
        definition = ?, description = ?
    WHERE srs_id = ?
  `);

  const changes = stmt.run(
    srs.srsName,
    srs.organization,
    srs.organizationCoordsysId,
    srs.definition,
    srs.description ?? null,
    srs.srsId,
  );

  stmt.finalize();

  if (changes === 0) {
    throw new Error(`SRS with ID ${srs.srsId} not found`);
  }
}

/**
 * Delete a spatial reference system.
 */
export function deleteSpatialReferenceSystem(
  db: Database,
  srsId: number,
): void {
  if (!isValidSrsId(srsId)) {
    throw new Error(`Invalid SRS ID: ${srsId}`);
  }

  // Don't allow deleting required SRS
  if ([4326, -1, 0].includes(srsId)) {
    throw new Error(`Cannot delete required SRS: ${srsId}`);
  }

  const stmt = db.prepare(`
    DELETE FROM gpkg_spatial_ref_sys
    WHERE srs_id = ?
  `);

  const changes = stmt.run(srsId);
  stmt.finalize();

  if (changes === 0) {
    throw new Error(`SRS with ID ${srsId} not found`);
  }
}

/**
 * Check if a spatial reference system exists.
 */
export function hasSpatialReferenceSystem(
  db: Database,
  srsId: number,
): boolean {
  if (!isValidSrsId(srsId)) {
    return false;
  }

  const stmt = db.prepare(`
    SELECT COUNT(*) FROM gpkg_spatial_ref_sys WHERE srs_id = ?
  `);

  const count = stmt.value<[number]>(srsId);
  stmt.finalize();

  return count !== null && count !== undefined && count[0] > 0;
}
