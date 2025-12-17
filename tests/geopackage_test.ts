import { assertEquals, assertExists } from "@std/assert";
import { GeoPackage } from "../mod.ts";

Deno.test("GeoPackage - Create and open database", () => {
  const gpkg = new GeoPackage(":memory:");
  assertExists(gpkg);
  assertEquals(gpkg.closed, false);
  gpkg.close();
  assertEquals(gpkg.closed, true);
});

Deno.test("GeoPackage - Initialize with default SRS", () => {
  const gpkg = new GeoPackage(":memory:");

  const srs4326 = gpkg.getSpatialReferenceSystem(4326);
  assertExists(srs4326);
  assertEquals(srs4326.srsId, 4326);
  assertEquals(srs4326.organization, "EPSG");

  const srsList = gpkg.listSpatialReferenceSystems();
  assertEquals(srsList.length >= 3, true); // At least 3 default SRS

  gpkg.close();
});

Deno.test("GeoPackage - Create feature table and insert feature", () => {
  const gpkg = new GeoPackage(":memory:");

  // Create feature table
  gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [
      { name: "name", type: "TEXT" },
      { name: "value", type: "REAL" },
    ],
  });

  // Check content was created
  const content = gpkg.getContent("points");
  assertExists(content);
  assertEquals(content.dataType, "features");

  // Insert feature
  const id = gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [-122.4, 37.8] },
    properties: { name: "San Francisco", value: 42.5 },
  });

  assertEquals(typeof id, "number");

  // Get feature
  const feature = gpkg.getFeature("points", id);
  assertExists(feature);
  assertEquals(feature.geometry?.type, "Point");
  assertEquals(feature.properties.name, "San Francisco");

  gpkg.close();
});

Deno.test("GeoPackage - Query features", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [
      { name: "name", type: "TEXT" },
      { name: "value", type: "REAL" },
    ],
  });

  // Insert multiple features
  gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [-122.4, 37.8] },
    properties: { name: "SF", value: 42.5 },
  });

  gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [-118.2, 34.0] },
    properties: { name: "LA", value: 35.0 },
  });

  gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [-73.9, 40.7] },
    properties: { name: "NYC", value: 50.0 },
  });

  // Query all
  const all = gpkg.queryFeatures("points");
  assertEquals(all.length, 3);

  // Query with WHERE
  const filtered = gpkg.queryFeatures("points", {
    where: "value > 40",
  });
  assertEquals(filtered.length, 2);

  // Count
  const count = gpkg.countFeatures("points");
  assertEquals(count, 3);

  gpkg.close();
});

Deno.test("GeoPackage - Update and delete features", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  const id = gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [-122.4, 37.8] },
    properties: { name: "Original" },
  });

  // Update
  gpkg.updateFeature("points", id, {
    properties: { name: "Updated" },
  });

  const updated = gpkg.getFeature("points", id);
  assertEquals(updated?.properties.name, "Updated");

  // Delete
  gpkg.deleteFeature("points", id);
  const deleted = gpkg.getFeature("points", id);
  assertEquals(deleted, undefined);

  gpkg.close();
});

Deno.test("GeoPackage - Create tile matrix set and insert tiles", () => {
  const gpkg = new GeoPackage(":memory:");

  // Create tile matrix set
  gpkg.createTileMatrixSet({
    tableName: "tiles",
    srsId: 3857,
    minX: -180,
    minY: -85,
    maxX: 180,
    maxY: 85,
  });

  // Add tile matrix for zoom level 0
  gpkg.addTileMatrix({
    tableName: "tiles",
    zoomLevel: 0,
    matrixWidth: 1,
    matrixHeight: 1,
    tileWidth: 256,
    tileHeight: 256,
    pixelXSize: 360,
    pixelYSize: 170,
  });

  // Insert tile
  const tileData = new Uint8Array([137, 80, 78, 71]); // PNG header
  const tileId = gpkg.insertTile("tiles", {
    zoomLevel: 0,
    tileColumn: 0,
    tileRow: 0,
    tileData,
  });

  assertEquals(typeof tileId, "number");

  // Get tile
  const tile = gpkg.getTile("tiles", { zoom: 0, column: 0, row: 0 });
  assertExists(tile);
  assertEquals(tile.zoomLevel, 0);
  assertEquals(tile.tileData.length, 4);

  gpkg.close();
});

Deno.test("GeoPackage - Extensions", () => {
  const gpkg = new GeoPackage(":memory:");

  // Add extension
  gpkg.addExtension({
    extensionName: "test_extension",
    definition: "http://example.com/test",
    scope: "read-write",
  });

  // Check extension
  const hasExt = gpkg.hasExtension("test_extension");
  assertEquals(hasExt, true);

  // List extensions
  const extensions = gpkg.listExtensions();
  assertEquals(extensions.length, 1);
  assertEquals(extensions[0].extensionName, "test_extension");

  gpkg.close();
});

Deno.test("GeoPackage - Transaction", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  // Transaction
  gpkg.transaction(() => {
    gpkg.insertFeature("points", {
      geometry: { type: "Point", coordinates: [0, 0] },
      properties: { name: "Point 1" },
    });

    gpkg.insertFeature("points", {
      geometry: { type: "Point", coordinates: [1, 1] },
      properties: { name: "Point 2" },
    });
  });

  const count = gpkg.countFeatures("points");
  assertEquals(count, 2);

  gpkg.close();
});

Deno.test("GeoPackage - listContents returns all content entries", () => {
  const gpkg = new GeoPackage(":memory:");

  // Create a feature table
  gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  // Create a tile matrix set
  gpkg.createTileMatrixSet({
    tableName: "tiles",
    srsId: 3857,
    minX: -180,
    minY: -85,
    maxX: 180,
    maxY: 85,
  });

  // List all contents
  const contents = gpkg.listContents();
  assertEquals(contents.length, 2);

  // Verify the content entries have correct properties
  const pointsContent = contents.find((c) => c.tableName === "points");
  assertExists(pointsContent);
  assertEquals(pointsContent.dataType, "features");
  assertEquals(pointsContent.srsId, 4326);

  const tilesContent = contents.find((c) => c.tableName === "tiles");
  assertExists(tilesContent);
  assertEquals(tilesContent.dataType, "tiles");
  assertEquals(tilesContent.srsId, 3857);

  gpkg.close();
});

Deno.test("GeoPackage - listContents returns empty array when no contents", () => {
  const gpkg = new GeoPackage(":memory:");

  const contents = gpkg.listContents();
  assertEquals(contents.length, 0);
  assertEquals(Array.isArray(contents), true);

  gpkg.close();
});

Deno.test("GeoPackage - listContentsByType filters by data type", () => {
  const gpkg = new GeoPackage(":memory:");

  // Create multiple feature tables
  gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  gpkg.createFeatureTable({
    tableName: "lines",
    geometryType: "LINESTRING",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  // Create a tile matrix set
  gpkg.createTileMatrixSet({
    tableName: "tiles",
    srsId: 3857,
    minX: -180,
    minY: -85,
    maxX: 180,
    maxY: 85,
  });

  // List only features
  const featureContents = gpkg.listContentsByType("features");
  assertEquals(featureContents.length, 2);
  assertEquals(featureContents.every((c) => c.dataType === "features"), true);

  // List only tiles
  const tileContents = gpkg.listContentsByType("tiles");
  assertEquals(tileContents.length, 1);
  assertEquals(tileContents[0].tableName, "tiles");
  assertEquals(tileContents[0].dataType, "tiles");

  // List attributes (should be empty)
  const attributeContents = gpkg.listContentsByType("attributes");
  assertEquals(attributeContents.length, 0);

  gpkg.close();
});
