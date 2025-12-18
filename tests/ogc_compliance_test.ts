import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { GeoPackage } from "../mod.ts";
import type { Database } from "@db/sqlite";

// Helper to access private DB instance for raw SQL checks
function getDb(gpkg: GeoPackage): Database {
  // @ts-ignore: accessing private property
  return gpkg.db;
}

Deno.test("OGC Compliance - Mandatory Tables Presence", async () => {
  const gpkg = await GeoPackage.memory();
  const db = getDb(gpkg);

  const mandatoryTables = [
    "gpkg_spatial_ref_sys",
    "gpkg_contents",
    "gpkg_geometry_columns",
    "gpkg_tile_matrix_set",
    "gpkg_tile_matrix",
    "gpkg_extensions",
  ];

  for (const table of mandatoryTables) {
    const row = db.prepare(
      "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?",
    ).value<[number]>(table);
    assertEquals(row?.[0], 1, `Table ${table} should exist`);
  }

  await gpkg.close();
});

Deno.test("OGC Compliance - Default Spatial Reference Systems", async () => {
  const gpkg = await GeoPackage.memory();

  // Requirement 11: The gpkg_spatial_ref_sys table SHALL contain a record for
  // organization "EPSG", organization_coordsys_id 4326 (WGS 84)
  const wgs84 = await gpkg.getSpatialReferenceSystem(4326);
  assertExists(wgs84);
  assertEquals(wgs84.organization, "EPSG");
  assertEquals(wgs84.organizationCoordsysId, 4326);

  // Requirement 12: The gpkg_spatial_ref_sys table SHALL contain a record for
  // organization "NONE", organization_coordsys_id -1 (Undefined Cartesian)
  const undefinedCartesian = await gpkg.getSpatialReferenceSystem(-1);
  assertExists(undefinedCartesian);
  assertEquals(undefinedCartesian.organization, "NONE");
  assertEquals(undefinedCartesian.organizationCoordsysId, -1);

  // Requirement 13: The gpkg_spatial_ref_sys table SHALL contain a record for
  // organization "NONE", organization_coordsys_id 0 (Undefined Geographic)
  const undefinedGeographic = await gpkg.getSpatialReferenceSystem(0);
  assertExists(undefinedGeographic);
  assertEquals(undefinedGeographic.organization, "NONE");
  assertEquals(undefinedGeographic.organizationCoordsysId, 0);

  await gpkg.close();
});

Deno.test("OGC Compliance - Geometry Header", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "test_geom",
    geometryType: "POINT",
    srsId: 4326,
  });

  const featureId = await gpkg.insertFeature("test_geom", {
    geometry: { type: "Point", coordinates: [10, 20] },
    properties: {},
  });

  const db = getDb(gpkg);
  const row = db.prepare("SELECT geom FROM test_geom WHERE id = ?").value<
    [Uint8Array]
  >(featureId);
  assertExists(row);
  const buffer = row[0];

  // Requirement 63: The first 2 bytes of a GeoPackage Binary Geometry Header
  // SHALL be 0x47 0x50 ("GP" in ASCII)
  assertEquals(buffer[0], 0x47);
  assertEquals(buffer[1], 0x50);

  // Requirement 64: The third byte of a GeoPackage Binary Geometry Header
  // SHALL be the version number. 0 for version 1.
  assertEquals(buffer[2], 0x00);

  // Requirement 65: The fourth byte SHALL define flags
  // We expect 0x01 (binaryType=0, empty=0, envelope=0, byteOrder=1 little endian)
  // Our implementation uses Little Endian by default
  const flags = buffer[3];
  const binaryType = (flags >> 5) & 0x01;
  assertEquals(binaryType, 0, "Standard GeoPackage Binary");

  const byteOrder = flags & 0x01;
  assertEquals(byteOrder, 1, "Little Endian");

  await gpkg.close();
});

Deno.test("OGC Compliance - gpkg_contents constraints", async () => {
  const gpkg = await GeoPackage.memory();
  const _db = getDb(gpkg);

  // Attempt to insert invalid content type
  await assertRejects(async () => {
    // We can't easily test SQL constraints via the API since the API validates before inserting.
    // So we use raw SQL to verify the database schema constraints are working (if defined).
    // Note: SQLite doesn't strictly enforce CHECK constraints unless enabled, and enum constraints are usually just CHECKs.
    // But we can check if the API prevents it.
    await gpkg.addContent({
      tableName: "invalid_table",
      // @ts-ignore: testing invalid type
      dataType: "invalid_type",
      srsId: 4326,
    });
  });

  await gpkg.close();
});

Deno.test("OGC Compliance - gpkg_geometry_columns constraints", async () => {
  const gpkg = await GeoPackage.memory();

  // Requirement 30: The srs_id in gpkg_geometry_columns MUST reference a srs_id in gpkg_spatial_ref_sys
  // The API should enforce this check before insertion.

  try {
    await gpkg.createFeatureTable({
      tableName: "bad_srs",
      geometryType: "POINT",
      srsId: 99999, // Doesn't exist
    });
    throw new Error("Should have failed");
  } catch (e) {
    if (e instanceof Error) {
      assertEquals(e.message.includes("SRS ID 99999 not found"), true);
    } else {
      throw e;
    }
  }

  await gpkg.close();
});
