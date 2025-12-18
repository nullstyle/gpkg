import { assertEquals, assertRejects } from "jsr:@std/assert";
import { GeoPackage, type WhereClause } from "../mod.ts";

Deno.test("Edge Cases - Invalid Geometry Types", async () => {
  const gpkg = await GeoPackage.memory();

  await assertRejects(
    async () => {
      await gpkg.createFeatureTable({
        tableName: "invalid_geom",
        // @ts-ignore: testing invalid type
        geometryType: "HYPERCUBE",
        srsId: 4326,
      });
    },
    Error,
    "Invalid geometry type",
  );

  await gpkg.close();
});

Deno.test("Edge Cases - Column Name Conflict", async () => {
  const gpkg = await GeoPackage.memory();

  await assertRejects(
    async () => {
      await gpkg.createFeatureTable({
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

  await gpkg.close();
});

Deno.test("Edge Cases - Geometry type enforcement on insert", async () => {
  const gpkg = await GeoPackage.memory();
  await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
  });

  // Inserting a Polygon into a POINT table should fail
  await assertRejects(
    async () => {
      await gpkg.insertFeature("points", {
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
  await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });

  const features = await gpkg.queryFeatures("points");
  assertEquals(features.length, 1);
  assertEquals(features[0].geometry?.type, "Point");

  await gpkg.close();
});

Deno.test("Edge Cases - GEOMETRY type accepts any geometry", async () => {
  const gpkg = await GeoPackage.memory();
  await gpkg.createFeatureTable({
    tableName: "any_geom",
    geometryType: "GEOMETRY",
    srsId: 4326,
  });

  // GEOMETRY column type should accept any geometry type
  await gpkg.insertFeature("any_geom", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });
  await gpkg.insertFeature("any_geom", {
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
    properties: {},
  });
  await gpkg.insertFeature("any_geom", {
    geometry: {
      type: "Polygon",
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    },
    properties: {},
  });

  const features = await gpkg.queryFeatures("any_geom");
  assertEquals(features.length, 3);

  await gpkg.close();
});

Deno.test("Edge Cases - Z dimension validation", async () => {
  const gpkg = await GeoPackage.memory();

  // Create table that prohibits Z (z=0)
  await gpkg.createFeatureTable({
    tableName: "no_z",
    geometryType: "POINT",
    srsId: 4326,
    z: 0,
  });

  // Create table that requires Z (z=1)
  await gpkg.createFeatureTable({
    tableName: "requires_z",
    geometryType: "POINT",
    srsId: 4326,
    z: 1,
  });

  // Create table that allows optional Z (z=2)
  await gpkg.createFeatureTable({
    tableName: "optional_z",
    geometryType: "POINT",
    srsId: 4326,
    z: 2,
  });

  // 2D point should work in no_z table
  await gpkg.insertFeature("no_z", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });

  // 3D point should fail in no_z table
  await assertRejects(async () => {
      await gpkg.insertFeature("no_z", {
        geometry: { type: "Point", coordinates: [0, 0, 10] },
        properties: {},
      });
    },
    Error,
    "prohibits Z values",
  );

  // 2D point should fail in requires_z table
  await assertRejects(async () => {
      await gpkg.insertFeature("requires_z", {
        geometry: { type: "Point", coordinates: [0, 0] },
        properties: {},
      });
    },
    Error,
    "requires Z values",
  );

  // 3D point should work in requires_z table
  await gpkg.insertFeature("requires_z", {
    geometry: { type: "Point", coordinates: [0, 0, 10] },
    properties: {},
  });

  // Both 2D and 3D should work in optional_z table
  await gpkg.insertFeature("optional_z", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });
  await gpkg.insertFeature("optional_z", {
    geometry: { type: "Point", coordinates: [0, 0, 10] },
    properties: {},
  });

  await gpkg.close();
});

Deno.test("Edge Cases - M dimension validation", async () => {
  const gpkg = await GeoPackage.memory();

  // Create table that prohibits M (m=0) but allows optional Z (z=2)
  await gpkg.createFeatureTable({
    tableName: "no_m",
    geometryType: "POINT",
    srsId: 4326,
    z: 2, // Optional Z
    m: 0, // No M allowed
  });

  // Create table that requires M (m=1)
  await gpkg.createFeatureTable({
    tableName: "requires_m",
    geometryType: "POINT",
    srsId: 4326,
    z: 1, // Need Z to have M (XYZM format)
    m: 1,
  });

  // 2D point should work in no_m table
  await gpkg.insertFeature("no_m", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });

  // 3D point (XYZ) should also work in no_m table (has Z but not M)
  await gpkg.insertFeature("no_m", {
    geometry: { type: "Point", coordinates: [0, 0, 10] },
    properties: {},
  });

  // 4D point (XYZM) should fail in no_m table
  await assertRejects(async () => {
      await gpkg.insertFeature("no_m", {
        geometry: { type: "Point", coordinates: [0, 0, 10, 100] },
        properties: {},
      });
    },
    Error,
    "prohibits M values",
  );

  // 3D point (XYZ without M) should fail in requires_m table
  await assertRejects(async () => {
      await gpkg.insertFeature("requires_m", {
        geometry: { type: "Point", coordinates: [0, 0, 10] },
        properties: {},
      });
    },
    Error,
    "requires M values",
  );

  // 4D point (XYZM) should work in requires_m table
  await gpkg.insertFeature("requires_m", {
    geometry: { type: "Point", coordinates: [0, 0, 10, 100] },
    properties: {},
  });

  await gpkg.close();
});

Deno.test("Edge Cases - Geometry type enforcement on update", async () => {
  const gpkg = await GeoPackage.memory();
  await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
  });

  // Insert a valid Point
  const id = await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });

  // Updating to a Polygon should fail
  await assertRejects(async () => {
      await gpkg.updateFeature("points", id, {
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
  const feature = await gpkg.getFeature("points", id);
  assertEquals(feature?.geometry?.type, "Point");

  // Updating to another Point should succeed
  await gpkg.updateFeature("points", id, {
    geometry: { type: "Point", coordinates: [5, 5] },
  });

  const updated = await gpkg.getFeature("points", id);
  assertEquals(updated?.geometry?.coordinates, [5, 5]);

  await gpkg.close();
});

Deno.test("Edge Cases - SQL Injection in Properties", async () => {
  const gpkg = await GeoPackage.memory();
  await gpkg.createFeatureTable({
    tableName: "injection",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "desc", type: "TEXT" }],
  });

  const badString = "test'); DROP TABLE injection; --";

  await gpkg.insertFeature("injection", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {
      desc: badString,
    },
  });

  const features = await gpkg.queryFeatures("injection");
  assertEquals(features[0].properties.desc, badString);

  // Verify table still exists
  const count = await gpkg.countFeatures("injection");
  assertEquals(count, 1);

  await gpkg.close();
});

Deno.test("Edge Cases - Parameterized WHERE clause", async () => {
  const gpkg = await GeoPackage.memory();
  await gpkg.createFeatureTable({
    tableName: "param_test",
    geometryType: "POINT",
    srsId: 4326,
    columns: [
      { name: "name", type: "TEXT" },
      { name: "value", type: "INTEGER" },
    ],
  });

  await gpkg.insertFeature("param_test", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { name: "alpha", value: 10 },
  });
  await gpkg.insertFeature("param_test", {
    geometry: { type: "Point", coordinates: [1, 1] },
    properties: { name: "beta", value: 20 },
  });
  await gpkg.insertFeature("param_test", {
    geometry: { type: "Point", coordinates: [2, 2] },
    properties: { name: "gamma", value: 30 },
  });

  // Test parameterized WHERE clause
  const whereClause: WhereClause = {
    sql: "value > ? AND name != ?",
    params: [15, "gamma"],
  };

  const features = await gpkg.queryFeatures("param_test", {
    where: whereClause,
  });
  assertEquals(features.length, 1);
  assertEquals(features[0].properties.name, "beta");

  // Test countFeatures with parameterized WHERE
  const count = await gpkg.countFeatures("param_test", { where: whereClause });
  assertEquals(count, 1);

  await gpkg.close();
});

Deno.test("Edge Cases - Parameterized WHERE prevents SQL injection", async () => {
  const gpkg = await GeoPackage.memory();
  await gpkg.createFeatureTable({
    tableName: "safe_query",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  await gpkg.insertFeature("safe_query", {
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
  const features = await gpkg.queryFeatures("safe_query", {
    where: whereClause,
  });
  assertEquals(features.length, 0);

  // Table should still exist and have its data
  const count = await gpkg.countFeatures("safe_query");
  assertEquals(count, 1);

  await gpkg.close();
});

Deno.test("Edge Cases - Tile Zoom Levels", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createTileMatrixSet({
    tableName: "tiles",
    srsId: 3857,
    minX: -180,
    minY: -90,
    maxX: 180,
    maxY: 90,
  });

  // Add matrix for zoom 0
  await gpkg.addTileMatrix({
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
  await gpkg.insertTile("tiles", {
    zoomLevel: 0,
    tileColumn: 0,
    tileRow: 0,
    tileData: new Uint8Array([1, 2, 3]),
  });

  // Insert tile at invalid zoom (no matrix)
  await assertRejects(async () => {
      await gpkg.insertTile("tiles", {
        zoomLevel: 1,
        tileColumn: 0,
        tileRow: 0,
        tileData: new Uint8Array([1, 2, 3]),
      });
    },
    Error,
    "not found",
  );

  await gpkg.close();
});

Deno.test("Edge Cases - Tile Coordinates Out of Bounds", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createTileMatrixSet({
    tableName: "tiles",
    srsId: 3857,
    minX: -180,
    minY: -90,
    maxX: 180,
    maxY: 90,
  });

  await gpkg.addTileMatrix({
    tableName: "tiles",
    zoomLevel: 0,
    matrixWidth: 1,
    matrixHeight: 1,
    tileWidth: 256,
    tileHeight: 256,
    pixelXSize: 1,
    pixelYSize: 1,
  });

  await assertRejects(async () => {
      await gpkg.insertTile("tiles", {
        zoomLevel: 0,
        tileColumn: 1, // Max is 0 (width 1)
        tileRow: 0,
        tileData: new Uint8Array([1, 2, 3]),
      });
    },
    Error,
    "out of bounds",
  );

  await gpkg.close();
});

Deno.test("Edge Cases - Empty Geometry", async () => {
  const gpkg = await GeoPackage.memory();
  await gpkg.createFeatureTable({
    tableName: "empty_test",
    geometryType: "GEOMETRY",
    srsId: 4326,
  });

  // Insert null geometry (should be treated as empty or NULL depending on implementation)
  // The insertFeature uses `null` for the blob if geometry is null.
  await gpkg.insertFeature("empty_test", {
    geometry: null,
    properties: {},
  });

  const features = await gpkg.queryFeatures("empty_test");
  assertEquals(features[0].geometry, null);

  await gpkg.close();
});

Deno.test("Edge Cases - Duplicate Extensions", async () => {
  const gpkg = await GeoPackage.memory();

  const ext = {
    extensionName: "test_ext",
    definition: "def",
    scope: "read-write" as const,
  };

  await gpkg.addExtension(ext);

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

  await assertRejects(async () => {
      await gpkg.addExtension(ext);
    },
    Error,
    "already registered",
  );

  await gpkg.close();
});
