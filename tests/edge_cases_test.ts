import { assertEquals, assertThrows } from "@std/assert";
import { GeoPackage, type WhereClause } from "../mod.ts";

Deno.test("Edge Cases - Invalid Geometry Types", () => {
  const gpkg = new GeoPackage(":memory:");

  assertThrows(
    () => {
      gpkg.createFeatureTable({
        tableName: "invalid_geom",
        // @ts-ignore: testing invalid type
        geometryType: "HYPERCUBE",
        srsId: 4326,
      });
    },
    Error,
    "Invalid geometry type",
  );

  gpkg.close();
});

Deno.test("Edge Cases - Column Name Conflict", () => {
  const gpkg = new GeoPackage(":memory:");

  assertThrows(
    () => {
      gpkg.createFeatureTable({
        tableName: "conflict",
        geometryType: "POINT",
        geometryColumn: "the_geom",
        srsId: 4326,
        columns: [
          { name: "the_geom", type: "TEXT" }, // Conflict with geometry column
        ],
      });
    },
    Error,
    "conflicts with geometry column",
  );

  gpkg.close();
});

Deno.test("Edge Cases - Geometry type enforcement on insert", () => {
  const gpkg = new GeoPackage(":memory:");
  gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
  });

  // Inserting a Polygon into a POINT table should fail
  assertThrows(
    () => {
      gpkg.insertFeature("points", {
        geometry: {
          type: "Polygon",
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        },
        properties: {},
      });
    },
    Error,
    "not compatible with declared type",
  );

  // Inserting a valid Point should succeed
  gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });

  const features = gpkg.queryFeatures("points");
  assertEquals(features.length, 1);
  assertEquals(features[0].geometry?.type, "Point");

  gpkg.close();
});

Deno.test("Edge Cases - GEOMETRY type accepts any geometry", () => {
  const gpkg = new GeoPackage(":memory:");
  gpkg.createFeatureTable({
    tableName: "any_geom",
    geometryType: "GEOMETRY",
    srsId: 4326,
  });

  // GEOMETRY column type should accept any geometry type
  gpkg.insertFeature("any_geom", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });
  gpkg.insertFeature("any_geom", {
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
    properties: {},
  });
  gpkg.insertFeature("any_geom", {
    geometry: {
      type: "Polygon",
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    },
    properties: {},
  });

  const features = gpkg.queryFeatures("any_geom");
  assertEquals(features.length, 3);

  gpkg.close();
});

Deno.test("Edge Cases - Geometry type enforcement on update", () => {
  const gpkg = new GeoPackage(":memory:");
  gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
  });

  // Insert a valid Point
  const id = gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });

  // Updating to a Polygon should fail
  assertThrows(
    () => {
      gpkg.updateFeature("points", id, {
        geometry: {
          type: "Polygon",
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        },
      });
    },
    Error,
    "not compatible with declared type",
  );

  // Verify the original geometry is unchanged
  const feature = gpkg.getFeature("points", id);
  assertEquals(feature?.geometry?.type, "Point");

  // Updating to another Point should succeed
  gpkg.updateFeature("points", id, {
    geometry: { type: "Point", coordinates: [5, 5] },
  });

  const updated = gpkg.getFeature("points", id);
  assertEquals(updated?.geometry?.coordinates, [5, 5]);

  gpkg.close();
});

Deno.test("Edge Cases - SQL Injection in Properties", () => {
  const gpkg = new GeoPackage(":memory:");
  gpkg.createFeatureTable({
    tableName: "injection",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "desc", type: "TEXT" }],
  });

  const badString = "test'); DROP TABLE injection; --";

  gpkg.insertFeature("injection", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {
      desc: badString,
    },
  });

  const features = gpkg.queryFeatures("injection");
  assertEquals(features[0].properties.desc, badString);

  // Verify table still exists
  const count = gpkg.countFeatures("injection");
  assertEquals(count, 1);

  gpkg.close();
});

Deno.test("Edge Cases - Parameterized WHERE clause", () => {
  const gpkg = new GeoPackage(":memory:");
  gpkg.createFeatureTable({
    tableName: "param_test",
    geometryType: "POINT",
    srsId: 4326,
    columns: [
      { name: "name", type: "TEXT" },
      { name: "value", type: "INTEGER" },
    ],
  });

  gpkg.insertFeature("param_test", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { name: "alpha", value: 10 },
  });
  gpkg.insertFeature("param_test", {
    geometry: { type: "Point", coordinates: [1, 1] },
    properties: { name: "beta", value: 20 },
  });
  gpkg.insertFeature("param_test", {
    geometry: { type: "Point", coordinates: [2, 2] },
    properties: { name: "gamma", value: 30 },
  });

  // Test parameterized WHERE clause
  const whereClause: WhereClause = {
    sql: "value > ? AND name != ?",
    params: [15, "gamma"],
  };

  const features = gpkg.queryFeatures("param_test", { where: whereClause });
  assertEquals(features.length, 1);
  assertEquals(features[0].properties.name, "beta");

  // Test countFeatures with parameterized WHERE
  const count = gpkg.countFeatures("param_test", { where: whereClause });
  assertEquals(count, 1);

  gpkg.close();
});

Deno.test("Edge Cases - Parameterized WHERE prevents SQL injection", () => {
  const gpkg = new GeoPackage(":memory:");
  gpkg.createFeatureTable({
    tableName: "safe_query",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  gpkg.insertFeature("safe_query", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { name: "test" },
  });

  // Even if user provides malicious input as a parameter, it's safely escaped
  const maliciousInput = "test' OR '1'='1";
  const whereClause: WhereClause = {
    sql: "name = ?",
    params: [maliciousInput],
  };

  // This should find nothing because the malicious string is treated as a literal value
  const features = gpkg.queryFeatures("safe_query", { where: whereClause });
  assertEquals(features.length, 0);

  // Table should still exist and have its data
  const count = gpkg.countFeatures("safe_query");
  assertEquals(count, 1);

  gpkg.close();
});

Deno.test("Edge Cases - Tile Zoom Levels", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createTileMatrixSet({
    tableName: "tiles",
    srsId: 3857,
    minX: -180,
    minY: -90,
    maxX: 180,
    maxY: 90,
  });

  // Add matrix for zoom 0
  gpkg.addTileMatrix({
    tableName: "tiles",
    zoomLevel: 0,
    matrixWidth: 1,
    matrixHeight: 1,
    tileWidth: 256,
    tileHeight: 256,
    pixelXSize: 1,
    pixelYSize: 1,
  });

  // Insert tile at valid zoom
  gpkg.insertTile("tiles", {
    zoomLevel: 0,
    tileColumn: 0,
    tileRow: 0,
    tileData: new Uint8Array([1, 2, 3]),
  });

  // Insert tile at invalid zoom (no matrix)
  assertThrows(
    () => {
      gpkg.insertTile("tiles", {
        zoomLevel: 1,
        tileColumn: 0,
        tileRow: 0,
        tileData: new Uint8Array([1, 2, 3]),
      });
    },
    Error,
    "not found",
  );

  gpkg.close();
});

Deno.test("Edge Cases - Tile Coordinates Out of Bounds", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createTileMatrixSet({
    tableName: "tiles",
    srsId: 3857,
    minX: -180,
    minY: -90,
    maxX: 180,
    maxY: 90,
  });

  gpkg.addTileMatrix({
    tableName: "tiles",
    zoomLevel: 0,
    matrixWidth: 1,
    matrixHeight: 1,
    tileWidth: 256,
    tileHeight: 256,
    pixelXSize: 1,
    pixelYSize: 1,
  });

  assertThrows(
    () => {
      gpkg.insertTile("tiles", {
        zoomLevel: 0,
        tileColumn: 1, // Max is 0 (width 1)
        tileRow: 0,
        tileData: new Uint8Array([1, 2, 3]),
      });
    },
    Error,
    "out of bounds",
  );

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
    properties: {},
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
    scope: "read-write" as const,
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

  assertThrows(
    () => {
      gpkg.addExtension(ext);
    },
    Error,
    "already registered",
  );

  gpkg.close();
});
