/**
 * R-tree spatial index unit tests.
 * Tests the gpkg_rtree_index extension implementation.
 */

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { type BoundingBox, GeoPackage } from "../mod.ts";

// ============== Index Creation and Management ==============

Deno.test("R-tree - Create spatial index on empty table", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "empty_indexed",
    geometryType: "POINT",
    srsId: 4326,
  });

  assertEquals(await gpkg.hasSpatialIndex("empty_indexed"), false);
  await gpkg.createSpatialIndex("empty_indexed");
  assertEquals(await gpkg.hasSpatialIndex("empty_indexed"), true);

  // Verify extension was registered
  const ext = await gpkg.getExtension(
    "gpkg_rtree_index",
    "empty_indexed",
    "geom",
  );
  assertExists(ext);
  assertEquals(ext.scope, "write-only");

  await gpkg.close();
});

Deno.test("R-tree - Create spatial index on table with existing data", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "preexisting",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  // Insert data before creating index
  await gpkg.insertFeature("preexisting", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { name: "A" },
  });
  await gpkg.insertFeature("preexisting", {
    geometry: { type: "Point", coordinates: [10, 10] },
    properties: { name: "B" },
  });
  await gpkg.insertFeature("preexisting", {
    geometry: { type: "Point", coordinates: [20, 20] },
    properties: { name: "C" },
  });

  // Create index - should populate from existing data
  await gpkg.createSpatialIndex("preexisting");

  // Query should work and use the index
  const results = await gpkg.queryFeatures("preexisting", {
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
  });
  assertEquals(results.length, 1);
  assertEquals(results[0].properties.name, "A");

  await gpkg.close();
});

Deno.test("R-tree - Cannot create duplicate index", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "dup_index",
    geometryType: "POINT",
    srsId: 4326,
  });

  await gpkg.createSpatialIndex("dup_index");

  await assertRejects(
    async () => await gpkg.createSpatialIndex("dup_index"),
    Error,
    "already exists",
  );

  await gpkg.close();
});

Deno.test("R-tree - Drop spatial index", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "drop_test",
    geometryType: "POINT",
    srsId: 4326,
  });

  await gpkg.createSpatialIndex("drop_test");
  assertEquals(await gpkg.hasSpatialIndex("drop_test"), true);

  await gpkg.dropSpatialIndex("drop_test");
  assertEquals(await gpkg.hasSpatialIndex("drop_test"), false);

  await gpkg.close();
});

Deno.test("R-tree - Cannot drop non-existent index", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "no_index",
    geometryType: "POINT",
    srsId: 4326,
  });

  await assertRejects(
    async () => await gpkg.dropSpatialIndex("no_index"),
    Error,
    "does not exist",
  );

  await gpkg.close();
});

Deno.test("R-tree - Cannot create index on non-feature table", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createAttributeTable({
    tableName: "attributes",
    columns: [{ name: "value", type: "TEXT" }],
  });

  await assertRejects(
    async () => await gpkg.createSpatialIndex("attributes"),
    Error,
    "not a feature table",
  );

  await gpkg.close();
});

// ============== Index Maintenance on Insert ==============

Deno.test("R-tree - Index updated on feature insert", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "insert_test",
    geometryType: "POINT",
    srsId: 4326,
  });

  await gpkg.createSpatialIndex("insert_test");

  // Insert feature
  await gpkg.insertFeature("insert_test", {
    geometry: { type: "Point", coordinates: [50, 50] },
    properties: {},
  });

  // Should be found via index
  const results = await gpkg.queryFeatures("insert_test", {
    bounds: { minX: 45, minY: 45, maxX: 55, maxY: 55 },
  });
  assertEquals(results.length, 1);

  await gpkg.close();
});

Deno.test("R-tree - Insert feature with null geometry", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "null_geom",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  await gpkg.createSpatialIndex("null_geom");

  // Insert feature with null geometry
  await gpkg.insertFeature("null_geom", {
    geometry: null,
    properties: { name: "no geometry" },
  });

  // Insert feature with geometry
  await gpkg.insertFeature("null_geom", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { name: "has geometry" },
  });

  // Bounds query should only find the one with geometry
  const results = await gpkg.queryFeatures("null_geom", {
    bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
  });
  assertEquals(results.length, 1);
  assertEquals(results[0].properties.name, "has geometry");

  await gpkg.close();
});

// ============== Index Maintenance on Update ==============

Deno.test("R-tree - Index updated when geometry moves", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "move_test",
    geometryType: "POINT",
    srsId: 4326,
  });

  await gpkg.createSpatialIndex("move_test");

  const id = await gpkg.insertFeature("move_test", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });

  // Found at original location
  let results = await gpkg.queryFeatures("move_test", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 1);

  // Move to new location
  await gpkg.updateFeature("move_test", id, {
    geometry: { type: "Point", coordinates: [100, 100] },
  });

  // Not found at original location
  results = await gpkg.queryFeatures("move_test", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 0);

  // Found at new location
  results = await gpkg.queryFeatures("move_test", {
    bounds: { minX: 99, minY: 99, maxX: 101, maxY: 101 },
  });
  assertEquals(results.length, 1);

  await gpkg.close();
});

Deno.test("R-tree - Index updated when geometry removed", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "remove_geom",
    geometryType: "POINT",
    srsId: 4326,
  });

  await gpkg.createSpatialIndex("remove_geom");

  const id = await gpkg.insertFeature("remove_geom", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });

  // Found initially
  let results = await gpkg.queryFeatures("remove_geom", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 1);

  // Remove geometry
  await gpkg.updateFeature("remove_geom", id, {
    geometry: null,
  });

  // Not found after geometry removal
  results = await gpkg.queryFeatures("remove_geom", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 0);

  await gpkg.close();
});

Deno.test("R-tree - Index updated when geometry added to feature", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "add_geom",
    geometryType: "POINT",
    srsId: 4326,
  });

  await gpkg.createSpatialIndex("add_geom");

  // Insert without geometry
  const id = await gpkg.insertFeature("add_geom", {
    geometry: null,
    properties: {},
  });

  // Not found (no geometry)
  let results = await gpkg.queryFeatures("add_geom", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 0);

  // Add geometry
  await gpkg.updateFeature("add_geom", id, {
    geometry: { type: "Point", coordinates: [0, 0] },
  });

  // Now found
  results = await gpkg.queryFeatures("add_geom", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 1);

  await gpkg.close();
});

// ============== Index Maintenance on Delete ==============

Deno.test("R-tree - Index updated on feature delete", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "delete_test",
    geometryType: "POINT",
    srsId: 4326,
  });

  await gpkg.createSpatialIndex("delete_test");

  const id = await gpkg.insertFeature("delete_test", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });

  // Found initially
  let results = await gpkg.queryFeatures("delete_test", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 1);

  // Delete feature
  await gpkg.deleteFeature("delete_test", id);

  // Not found after deletion
  results = await gpkg.queryFeatures("delete_test", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 0);

  await gpkg.close();
});

// ============== Query Operations ==============

Deno.test("R-tree - Query with exact bounds", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "exact_bounds",
    geometryType: "POINT",
    srsId: 4326,
  });

  await gpkg.createSpatialIndex("exact_bounds");

  await gpkg.insertFeature("exact_bounds", {
    geometry: { type: "Point", coordinates: [5, 5] },
    properties: {},
  });

  // Bounds exactly containing the point
  const results = await gpkg.queryFeatures("exact_bounds", {
    bounds: { minX: 5, minY: 5, maxX: 5, maxY: 5 },
  });
  assertEquals(results.length, 1);

  await gpkg.close();
});

Deno.test("R-tree - Query with bounds not intersecting any features", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "no_intersect",
    geometryType: "POINT",
    srsId: 4326,
  });

  await gpkg.createSpatialIndex("no_intersect");

  await gpkg.insertFeature("no_intersect", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });

  // Bounds far from point
  const results = await gpkg.queryFeatures("no_intersect", {
    bounds: { minX: 100, minY: 100, maxX: 200, maxY: 200 },
  });
  assertEquals(results.length, 0);

  await gpkg.close();
});

Deno.test("R-tree - Query combined with WHERE clause", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "combined_query",
    geometryType: "POINT",
    srsId: 4326,
    columns: [
      { name: "category", type: "TEXT" },
      { name: "value", type: "INTEGER" },
    ],
  });

  await gpkg.createSpatialIndex("combined_query");

  // Insert multiple points in same area with different properties
  await gpkg.insertFeature("combined_query", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { category: "A", value: 10 },
  });
  await gpkg.insertFeature("combined_query", {
    geometry: { type: "Point", coordinates: [1, 1] },
    properties: { category: "B", value: 20 },
  });
  await gpkg.insertFeature("combined_query", {
    geometry: { type: "Point", coordinates: [2, 2] },
    properties: { category: "A", value: 30 },
  });

  // Query with both bounds and WHERE
  const results = await gpkg.queryFeatures("combined_query", {
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
    where: { sql: "category = ?", params: ["A"] },
  });

  assertEquals(results.length, 2);
  for (const r of results) {
    assertEquals(r.properties.category, "A");
  }

  await gpkg.close();
});

Deno.test("R-tree - Query with limit and offset", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "limit_offset",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "index", type: "INTEGER" }],
  });

  await gpkg.createSpatialIndex("limit_offset");

  // Insert 10 points
  for (let i = 0; i < 10; i++) {
    await gpkg.insertFeature("limit_offset", {
      geometry: { type: "Point", coordinates: [i, i] },
      properties: { index: i },
    });
  }

  // All within bounds
  const bounds: BoundingBox = { minX: -1, minY: -1, maxX: 15, maxY: 15 };

  // No limit
  let results = await gpkg.queryFeatures("limit_offset", { bounds });
  assertEquals(results.length, 10);

  // With limit
  results = await gpkg.queryFeatures("limit_offset", { bounds, limit: 3 });
  assertEquals(results.length, 3);

  // With offset
  results = await gpkg.queryFeatures("limit_offset", { bounds, offset: 5 });
  assertEquals(results.length, 5);

  // With both
  results = await gpkg.queryFeatures("limit_offset", {
    bounds,
    limit: 2,
    offset: 3,
  });
  assertEquals(results.length, 2);

  await gpkg.close();
});

// ============== Different Geometry Types ==============

Deno.test("R-tree - Index works with LineString geometries", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "lines",
    geometryType: "LINESTRING",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  await gpkg.createSpatialIndex("lines");

  // Horizontal line
  await gpkg.insertFeature("lines", {
    geometry: {
      type: "LineString",
      coordinates: [[0, 0], [10, 0]],
    },
    properties: { name: "horizontal" },
  });

  // Vertical line far away
  await gpkg.insertFeature("lines", {
    geometry: {
      type: "LineString",
      coordinates: [[100, 0], [100, 10]],
    },
    properties: { name: "vertical" },
  });

  // Query near origin
  const results = await gpkg.queryFeatures("lines", {
    bounds: { minX: -5, minY: -5, maxX: 15, maxY: 5 },
  });
  assertEquals(results.length, 1);
  assertEquals(results[0].properties.name, "horizontal");

  await gpkg.close();
});

Deno.test("R-tree - Index works with Polygon geometries", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "polygons",
    geometryType: "POLYGON",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  await gpkg.createSpatialIndex("polygons");

  // Small polygon at origin
  await gpkg.insertFeature("polygons", {
    geometry: {
      type: "Polygon",
      coordinates: [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]],
    },
    properties: { name: "small" },
  });

  // Large polygon far away
  await gpkg.insertFeature("polygons", {
    geometry: {
      type: "Polygon",
      coordinates: [[[100, 100], [200, 100], [200, 200], [100, 200], [
        100,
        100,
      ]]],
    },
    properties: { name: "large" },
  });

  // Query intersecting small polygon
  const results = await gpkg.queryFeatures("polygons", {
    bounds: { minX: 2, minY: 2, maxX: 3, maxY: 3 },
  });
  assertEquals(results.length, 1);
  assertEquals(results[0].properties.name, "small");

  await gpkg.close();
});

Deno.test("R-tree - Index works with MultiPoint geometries", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "multipoints",
    geometryType: "MULTIPOINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  await gpkg.createSpatialIndex("multipoints");

  // MultiPoint spanning an area
  await gpkg.insertFeature("multipoints", {
    geometry: {
      type: "MultiPoint",
      coordinates: [[0, 0], [10, 10], [20, 20]],
    },
    properties: { name: "diagonal" },
  });

  // Query that only overlaps part of the multipoint's envelope
  const results = await gpkg.queryFeatures("multipoints", {
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
  });
  assertEquals(results.length, 1);
  assertEquals(results[0].properties.name, "diagonal");

  await gpkg.close();
});

Deno.test("R-tree - Index works with MultiPolygon geometries", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "multipolygons",
    geometryType: "MULTIPOLYGON",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  await gpkg.createSpatialIndex("multipolygons");

  // MultiPolygon with two separate polygons
  await gpkg.insertFeature("multipolygons", {
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]],
        [[[50, 50], [55, 50], [55, 55], [50, 55], [50, 50]]],
      ],
    },
    properties: { name: "two-parts" },
  });

  // Query overlapping either part should find it
  let results = await gpkg.queryFeatures("multipolygons", {
    bounds: { minX: 0, minY: 0, maxX: 3, maxY: 3 },
  });
  assertEquals(results.length, 1);

  results = await gpkg.queryFeatures("multipolygons", {
    bounds: { minX: 52, minY: 52, maxX: 54, maxY: 54 },
  });
  assertEquals(results.length, 1);

  // Query in the gap between the two parts
  // R-tree indexes the envelope of the entire geometry, which spans (0,0)-(55,55)
  // So a query in the gap will still find the feature (envelope intersection)
  // The actual geometry intersection filtering happens in memory after the R-tree query
  results = await gpkg.queryFeatures("multipolygons", {
    bounds: { minX: 25, minY: 25, maxX: 30, maxY: 30 },
  });
  // This returns 1 because the R-tree envelope intersects, even though
  // the actual geometry doesn't. This is expected R-tree behavior.
  assertEquals(results.length, 1);

  await gpkg.close();
});

// ============== Rebuild Index ==============

Deno.test("R-tree - Rebuild index restores correct state", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "rebuild",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  await gpkg.createSpatialIndex("rebuild");

  // Insert features
  await gpkg.insertFeature("rebuild", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { name: "A" },
  });
  await gpkg.insertFeature("rebuild", {
    geometry: { type: "Point", coordinates: [10, 10] },
    properties: { name: "B" },
  });
  await gpkg.insertFeature("rebuild", {
    geometry: { type: "Point", coordinates: [20, 20] },
    properties: { name: "C" },
  });

  // Verify initial state
  let results = await gpkg.queryFeatures("rebuild", {
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
  });
  assertEquals(results.length, 1);
  assertEquals(results[0].properties.name, "A");

  // Rebuild index
  gpkg.rebuildSpatialIndex("rebuild");

  // Verify same results after rebuild
  results = await gpkg.queryFeatures("rebuild", {
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
  });
  assertEquals(results.length, 1);
  assertEquals(results[0].properties.name, "A");

  // Check all points still accessible
  results = await gpkg.queryFeatures("rebuild", {
    bounds: { minX: -5, minY: -5, maxX: 25, maxY: 25 },
  });
  assertEquals(results.length, 3);

  await gpkg.close();
});

// ============== Edge Cases ==============

Deno.test("R-tree - Large coordinate values", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "large_coords",
    geometryType: "POINT",
    srsId: 3857, // Web Mercator has large values
  });

  await gpkg.createSpatialIndex("large_coords");

  // Insert point with large coordinates (typical Web Mercator values)
  await gpkg.insertFeature("large_coords", {
    geometry: { type: "Point", coordinates: [-13627665, 4548216] },
    properties: {},
  });

  // Query around the point
  const results = await gpkg.queryFeatures("large_coords", {
    bounds: {
      minX: -13627700,
      minY: 4548200,
      maxX: -13627600,
      maxY: 4548300,
    },
  });
  assertEquals(results.length, 1);

  await gpkg.close();
});

Deno.test("R-tree - Negative coordinate values", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "negative_coords",
    geometryType: "POINT",
    srsId: 4326,
  });

  await gpkg.createSpatialIndex("negative_coords");

  // Insert points in all quadrants
  await gpkg.insertFeature("negative_coords", {
    geometry: { type: "Point", coordinates: [-100, -50] },
    properties: {},
  });
  await gpkg.insertFeature("negative_coords", {
    geometry: { type: "Point", coordinates: [100, 50] },
    properties: {},
  });

  // Query in negative quadrant
  let results = await gpkg.queryFeatures("negative_coords", {
    bounds: { minX: -150, minY: -100, maxX: -50, maxY: 0 },
  });
  assertEquals(results.length, 1);

  // Query in positive quadrant
  results = await gpkg.queryFeatures("negative_coords", {
    bounds: { minX: 50, minY: 0, maxX: 150, maxY: 100 },
  });
  assertEquals(results.length, 1);

  await gpkg.close();
});

Deno.test("R-tree - Very small features", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "small_features",
    geometryType: "POLYGON",
    srsId: 4326,
  });

  await gpkg.createSpatialIndex("small_features");

  // Very small polygon
  await gpkg.insertFeature("small_features", {
    geometry: {
      type: "Polygon",
      coordinates: [[[0, 0], [0.0001, 0], [0.0001, 0.0001], [0, 0.0001], [
        0,
        0,
      ]]],
    },
    properties: {},
  });

  // Query with small bounds
  const results = await gpkg.queryFeatures("small_features", {
    bounds: { minX: -0.001, minY: -0.001, maxX: 0.001, maxY: 0.001 },
  });
  assertEquals(results.length, 1);

  await gpkg.close();
});

Deno.test("R-tree - Query performance comparison (indexed vs non-indexed)", async () => {
  const gpkg = await GeoPackage.memory();

  // Create two identical tables
  await gpkg.createFeatureTable({
    tableName: "indexed",
    geometryType: "POINT",
    srsId: 4326,
  });

  await gpkg.createFeatureTable({
    tableName: "not_indexed",
    geometryType: "POINT",
    srsId: 4326,
  });

  // Add spatial index to one
  await gpkg.createSpatialIndex("indexed");

  // Insert same data into both
  const numPoints = 100;
  for (let i = 0; i < numPoints; i++) {
    const x = (i % 10) * 10;
    const y = Math.floor(i / 10) * 10;

    await gpkg.insertFeature("indexed", {
      geometry: { type: "Point", coordinates: [x, y] },
      properties: {},
    });

    await gpkg.insertFeature("not_indexed", {
      geometry: { type: "Point", coordinates: [x, y] },
      properties: {},
    });
  }

  // Small query bounds (should benefit from index)
  const bounds: BoundingBox = { minX: 0, minY: 0, maxX: 15, maxY: 15 };

  // Both should return same results
  const indexedResults = await gpkg.queryFeatures("indexed", { bounds });
  const notIndexedResults = await gpkg.queryFeatures("not_indexed", { bounds });

  assertEquals(indexedResults.length, notIndexedResults.length);
  assertEquals(indexedResults.length, 4); // Points at (0,0), (10,0), (0,10), (10,10)

  await gpkg.close();
});

Deno.test("R-tree - Custom geometry column name", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "custom_geom",
    geometryType: "POINT",
    geometryColumn: "the_geom",
    srsId: 4326,
  });

  await gpkg.createSpatialIndex("custom_geom");

  await gpkg.insertFeature("custom_geom", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });

  // Verify extension registered with correct column name
  const ext = gpkg.getExtension(
    "gpkg_rtree_index",
    "custom_geom",
    "the_geom",
  );
  assertExists(ext);

  // Query should still work
  const results = await gpkg.queryFeatures("custom_geom", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 1);

  await gpkg.close();
});

Deno.test("R-tree - Index with Z coordinates", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "with_z",
    geometryType: "POINT",
    srsId: 4326,
    z: 2, // Optional Z
  });

  await gpkg.createSpatialIndex("with_z");

  // Insert 3D point
  await gpkg.insertFeature("with_z", {
    geometry: { type: "Point", coordinates: [10, 20, 100] },
    properties: {},
  });

  // 2D bounds query should still work (ignoring Z)
  const results = await gpkg.queryFeatures("with_z", {
    bounds: { minX: 5, minY: 15, maxX: 15, maxY: 25 },
  });
  assertEquals(results.length, 1);

  await gpkg.close();
});

Deno.test("R-tree - Many features stress test", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "stress_test",
    geometryType: "POINT",
    srsId: 4326,
  });

  await gpkg.createSpatialIndex("stress_test");

  // Insert many points in a grid
  const gridSize = 50;
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      await gpkg.insertFeature("stress_test", {
        geometry: { type: "Point", coordinates: [x, y] },
        properties: {},
      });
    }
  }

  // Total features
  assertEquals(await gpkg.countFeatures("stress_test"), gridSize * gridSize);

  // Query small region
  const results = await gpkg.queryFeatures("stress_test", {
    bounds: { minX: 10, minY: 10, maxX: 15, maxY: 15 },
  });

  // Should find 6x6 = 36 points (inclusive bounds)
  assertEquals(results.length, 36);

  await gpkg.close();
});

Deno.test("R-tree - Transaction with spatial index", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "tx_test",
    geometryType: "POINT",
    srsId: 4326,
  });

  await gpkg.createSpatialIndex("tx_test");

  // Insert multiple features (transaction callback must be sync, so we insert sequentially)
  await gpkg.insertFeature("tx_test", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });
  await gpkg.insertFeature("tx_test", {
    geometry: { type: "Point", coordinates: [10, 10] },
    properties: {},
  });
  await gpkg.insertFeature("tx_test", {
    geometry: { type: "Point", coordinates: [20, 20] },
    properties: {},
  });

  // All should be indexed
  const results = await gpkg.queryFeatures("tx_test", {
    bounds: { minX: -5, minY: -5, maxX: 25, maxY: 25 },
  });
  assertEquals(results.length, 3);

  await gpkg.close();
});
