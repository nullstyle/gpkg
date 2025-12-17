import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { GeoPackage } from "../mod.ts";

Deno.test("Edge Cases - Invalid Geometry Types", () => {
  const gpkg = new GeoPackage(":memory:");

  assertThrows(() => {
    gpkg.createFeatureTable({
      tableName: "invalid_geom",
      // @ts-ignore: testing invalid type
      geometryType: "HYPERCUBE",
      srsId: 4326,
    });
  }, Error, "Invalid geometry type");

  gpkg.close();
});

Deno.test("Edge Cases - Column Name Conflict", () => {
  const gpkg = new GeoPackage(":memory:");

  assertThrows(() => {
    gpkg.createFeatureTable({
      tableName: "conflict",
      geometryType: "POINT",
      geometryColumn: "the_geom",
      srsId: 4326,
      columns: [
        { name: "the_geom", type: "TEXT" } // Conflict with geometry column
      ]
    });
  }, Error, "conflicts with geometry column");

  gpkg.close();
});

Deno.test("Edge Cases - Insert invalid geometry for table", () => {
  // SQLite/GeoPackage usually allows different geometry types in the same column (if BLOB),
  // but strict compliance might require checking against gpkg_geometry_columns.
  // The current implementation does not strictly enforce geometry type on insert (it just encodes what it gets).
  // However, we should verify that it encodes correctly.

  const gpkg = new GeoPackage(":memory:");
  gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
  });

  // Inserting a Polygon into a POINT table.
  // The library currently allows this as it just encodes to WKB.
  // This test documents current behavior, but we might want to restrict it in future.
  gpkg.insertFeature("points", {
    geometry: {
      type: "Polygon",
      coordinates: [[[0,0], [1,0], [1,1], [0,0]]]
    },
    properties: {}
  });

  const features = gpkg.queryFeatures("points");
  assertEquals(features.length, 1);
  assertEquals(features[0].geometry?.type, "Polygon");

  gpkg.close();
});

Deno.test("Edge Cases - SQL Injection in Properties", () => {
  const gpkg = new GeoPackage(":memory:");
  gpkg.createFeatureTable({
    tableName: "injection",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "desc", type: "TEXT" }]
  });

  const badString = "test'); DROP TABLE injection; --";

  gpkg.insertFeature("injection", {
    geometry: { type: "Point", coordinates: [0,0] },
    properties: {
      desc: badString
    }
  });

  const features = gpkg.queryFeatures("injection");
  assertEquals(features[0].properties.desc, badString);

  // Verify table still exists
  const count = gpkg.countFeatures("injection");
  assertEquals(count, 1);

  gpkg.close();
});

Deno.test("Edge Cases - Tile Zoom Levels", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createTileMatrixSet({
    tableName: "tiles",
    srsId: 3857,
    minX: -180, minY: -90, maxX: 180, maxY: 90
  });

  // Add matrix for zoom 0
  gpkg.addTileMatrix({
    tableName: "tiles",
    zoomLevel: 0,
    matrixWidth: 1, matrixHeight: 1,
    tileWidth: 256, tileHeight: 256,
    pixelXSize: 1, pixelYSize: 1
  });

  // Insert tile at valid zoom
  gpkg.insertTile("tiles", {
    zoomLevel: 0, tileColumn: 0, tileRow: 0,
    tileData: new Uint8Array([1,2,3])
  });

  // Insert tile at invalid zoom (no matrix)
  assertThrows(() => {
    gpkg.insertTile("tiles", {
      zoomLevel: 1, tileColumn: 0, tileRow: 0,
      tileData: new Uint8Array([1,2,3])
    });
  }, Error, "not found");

  gpkg.close();
});

Deno.test("Edge Cases - Tile Coordinates Out of Bounds", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createTileMatrixSet({
    tableName: "tiles",
    srsId: 3857,
    minX: -180, minY: -90, maxX: 180, maxY: 90
  });

  gpkg.addTileMatrix({
    tableName: "tiles",
    zoomLevel: 0,
    matrixWidth: 1, matrixHeight: 1,
    tileWidth: 256, tileHeight: 256,
    pixelXSize: 1, pixelYSize: 1
  });

  assertThrows(() => {
    gpkg.insertTile("tiles", {
      zoomLevel: 0,
      tileColumn: 1, // Max is 0 (width 1)
      tileRow: 0,
      tileData: new Uint8Array([1,2,3])
    });
  }, Error, "out of bounds");

  gpkg.close();
});

Deno.test("Edge Cases - Empty Geometry", () => {
  const gpkg = new GeoPackage(":memory:");
  gpkg.createFeatureTable({
    tableName: "empty_test",
    geometryType: "GEOMETRY",
    srsId: 4326,
  });

  // Insert null geometry (should be treated as empty or NULL depending on implementation)
  // The insertFeature uses `null` for the blob if geometry is null.
  gpkg.insertFeature("empty_test", {
    geometry: null,
    properties: {}
  });

  const features = gpkg.queryFeatures("empty_test");
  assertEquals(features[0].geometry, null);

  gpkg.close();
});

Deno.test("Edge Cases - Duplicate Extensions", () => {
  const gpkg = new GeoPackage(":memory:");

  const ext = {
    extensionName: "test_ext",
    definition: "def",
    scope: "read-write" as const
  };

  gpkg.addExtension(ext);

  // Adding same extension should fail or be handled gracefully
  // Current implementation: `extensions.addExtension` inserts into table.
  // If no unique constraint violation, it might duplicate.
  // The schema usually has a UNIQUE constraint on extension_name + table_name + column_name.
  // The API `addExtension` checks `hasExtension` but throws if it exists?
  // Let's check the code: `extensions.ts` -> `addExtension` -> checks `hasExtension` -> if yes, throws.

  // Wait, `extensions.ts` says:
  /*
  const existing = getExtension(...);
  if (existing) {
     throw new Error(...);
  }
  */
  // But wait, `addExtension` in `extensions.ts` (impl) calls `getExtension`.

  assertThrows(() => {
    gpkg.addExtension(ext);
  }, Error, "already registered");

  gpkg.close();
});
