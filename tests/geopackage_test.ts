import { assertEquals, assertExists, assertThrows } from "@std/assert";
import {
  type BoundingBox,
  type GeoJSONFeatureCollection,
  GeoPackage,
  type WhereClause,
} from "../mod.ts";

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
    where: { sql: "value > ?", params: [40] },
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

  // List attributes (should be empty since we haven't created any yet)
  const attributeContents = gpkg.listContentsByType("attributes");
  assertEquals(attributeContents.length, 0);

  gpkg.close();
});

Deno.test("GeoPackage - Create attribute table and insert rows", () => {
  const gpkg = new GeoPackage(":memory:");

  // Create attribute table
  gpkg.createAttributeTable({
    tableName: "metadata",
    columns: [
      { name: "key", type: "TEXT", notNull: true },
      { name: "value", type: "TEXT" },
    ],
  });

  // Check content was created
  const content = gpkg.getContent("metadata");
  assertExists(content);
  assertEquals(content.dataType, "attributes");

  // Insert row
  const id = gpkg.insertAttribute("metadata", {
    properties: { key: "version", value: "1.0" },
  });

  assertEquals(typeof id, "number");

  // Get row
  const row = gpkg.getAttribute("metadata", id);
  assertExists(row);
  assertEquals(row.properties.key, "version");
  assertEquals(row.properties.value, "1.0");

  gpkg.close();
});

Deno.test("GeoPackage - Query attribute rows", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createAttributeTable({
    tableName: "settings",
    columns: [
      { name: "category", type: "TEXT" },
      { name: "name", type: "TEXT" },
      { name: "enabled", type: "INTEGER" },
    ],
  });

  // Insert multiple rows
  gpkg.insertAttribute("settings", {
    properties: { category: "display", name: "dark_mode", enabled: 1 },
  });
  gpkg.insertAttribute("settings", {
    properties: { category: "display", name: "compact", enabled: 0 },
  });
  gpkg.insertAttribute("settings", {
    properties: { category: "network", name: "cache", enabled: 1 },
  });

  // Query all
  const all = gpkg.queryAttributes("settings");
  assertEquals(all.length, 3);

  // Query with parameterized WHERE
  const displaySettings = gpkg.queryAttributes("settings", {
    where: { sql: "category = ?", params: ["display"] },
  });
  assertEquals(displaySettings.length, 2);

  // Query with multiple parameters
  const whereClause: WhereClause = {
    sql: "category = ? AND enabled = ?",
    params: ["display", 1],
  };
  const enabledDisplaySettings = gpkg.queryAttributes("settings", {
    where: whereClause,
  });
  assertEquals(enabledDisplaySettings.length, 1);
  assertEquals(enabledDisplaySettings[0].properties.name, "dark_mode");

  // Count
  const count = gpkg.countAttributes("settings");
  assertEquals(count, 3);

  gpkg.close();
});

Deno.test("GeoPackage - Update and delete attribute rows", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createAttributeTable({
    tableName: "items",
    columns: [
      { name: "name", type: "TEXT" },
      { name: "quantity", type: "INTEGER" },
    ],
  });

  const id = gpkg.insertAttribute("items", {
    properties: { name: "Widget", quantity: 10 },
  });

  // Update
  gpkg.updateAttribute("items", id, { quantity: 25 });

  const updated = gpkg.getAttribute("items", id);
  assertEquals(updated?.properties.quantity, 25);
  assertEquals(updated?.properties.name, "Widget"); // Unchanged

  // Delete
  gpkg.deleteAttribute("items", id);
  const deleted = gpkg.getAttribute("items", id);
  assertEquals(deleted, undefined);

  gpkg.close();
});

Deno.test("GeoPackage - listContentsByType returns attribute tables", () => {
  const gpkg = new GeoPackage(":memory:");

  // Create feature table
  gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
  });

  // Create attribute tables
  gpkg.createAttributeTable({
    tableName: "metadata",
    columns: [{ name: "key", type: "TEXT" }],
  });

  gpkg.createAttributeTable({
    tableName: "settings",
    columns: [{ name: "name", type: "TEXT" }],
  });

  // List attributes
  const attributeContents = gpkg.listContentsByType("attributes");
  assertEquals(attributeContents.length, 2);
  assertEquals(
    attributeContents.every((c) => c.dataType === "attributes"),
    true,
  );

  // Verify we can still list features
  const featureContents = gpkg.listContentsByType("features");
  assertEquals(featureContents.length, 1);

  gpkg.close();
});

Deno.test("GeoPackage - Attribute table error handling", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createAttributeTable({
    tableName: "test_attrs",
    columns: [{ name: "value", type: "TEXT" }],
  });

  // Cannot create duplicate table
  assertThrows(
    () => {
      gpkg.createAttributeTable({
        tableName: "test_attrs",
        columns: [{ name: "other", type: "TEXT" }],
      });
    },
    Error,
    "already exists",
  );

  // Cannot use attribute methods on feature tables
  gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
  });

  assertThrows(
    () => {
      gpkg.insertAttribute("points", { properties: { test: "value" } });
    },
    Error,
    "not an attribute table",
  );

  gpkg.close();
});

Deno.test("GeoPackage - Bounding box filtering", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "locations",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  // Insert points at different locations
  gpkg.insertFeature("locations", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { name: "Origin" },
  });
  gpkg.insertFeature("locations", {
    geometry: { type: "Point", coordinates: [10, 10] },
    properties: { name: "Northeast" },
  });
  gpkg.insertFeature("locations", {
    geometry: { type: "Point", coordinates: [-10, -10] },
    properties: { name: "Southwest" },
  });
  gpkg.insertFeature("locations", {
    geometry: { type: "Point", coordinates: [50, 50] },
    properties: { name: "Far Northeast" },
  });

  // Query with bounding box that includes Origin and Northeast
  const bounds: BoundingBox = {
    minX: -5,
    minY: -5,
    maxX: 15,
    maxY: 15,
  };

  const filtered = gpkg.queryFeatures("locations", { bounds });
  assertEquals(filtered.length, 2);

  const names = filtered.map((f) => f.properties.name).sort();
  assertEquals(names, ["Northeast", "Origin"]);

  // Query with bounds that includes only Far Northeast
  const farBounds: BoundingBox = {
    minX: 40,
    minY: 40,
    maxX: 60,
    maxY: 60,
  };

  const farFiltered = gpkg.queryFeatures("locations", { bounds: farBounds });
  assertEquals(farFiltered.length, 1);
  assertEquals(farFiltered[0].properties.name, "Far Northeast");

  // Query with bounds that doesn't include any points
  const emptyBounds: BoundingBox = {
    minX: 100,
    minY: 100,
    maxX: 110,
    maxY: 110,
  };

  const emptyFiltered = gpkg.queryFeatures("locations", {
    bounds: emptyBounds,
  });
  assertEquals(emptyFiltered.length, 0);

  gpkg.close();
});

Deno.test("GeoPackage - Bounding box filtering with limit and offset", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "grid",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "index", type: "INTEGER" }],
  });

  // Insert 10 points in a row
  for (let i = 0; i < 10; i++) {
    gpkg.insertFeature("grid", {
      geometry: { type: "Point", coordinates: [i, 0] },
      properties: { index: i },
    });
  }

  // Bounds that includes points 0-5
  const bounds: BoundingBox = {
    minX: -1,
    minY: -1,
    maxX: 5.5,
    maxY: 1,
  };

  // Without limit/offset, should get 6 points (0-5)
  const all = gpkg.queryFeatures("grid", { bounds });
  assertEquals(all.length, 6);

  // With limit
  const limited = gpkg.queryFeatures("grid", { bounds, limit: 3 });
  assertEquals(limited.length, 3);

  // With offset
  const offset = gpkg.queryFeatures("grid", { bounds, offset: 2 });
  assertEquals(offset.length, 4); // 6 - 2 = 4

  // With both limit and offset
  const both = gpkg.queryFeatures("grid", { bounds, limit: 2, offset: 1 });
  assertEquals(both.length, 2);

  gpkg.close();
});

Deno.test("GeoPackage - Bounding box filtering with polygon geometry", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "areas",
    geometryType: "POLYGON",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  // Small polygon at origin
  gpkg.insertFeature("areas", {
    geometry: {
      type: "Polygon",
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
    },
    properties: { name: "Small" },
  });

  // Large polygon far away
  gpkg.insertFeature("areas", {
    geometry: {
      type: "Polygon",
      coordinates: [[[100, 100], [110, 100], [110, 110], [100, 110], [
        100,
        100,
      ]]],
    },
    properties: { name: "Large" },
  });

  // Bounds that intersects only the small polygon
  const bounds: BoundingBox = {
    minX: -5,
    minY: -5,
    maxX: 5,
    maxY: 5,
  };

  const filtered = gpkg.queryFeatures("areas", { bounds });
  assertEquals(filtered.length, 1);
  assertEquals(filtered[0].properties.name, "Small");

  gpkg.close();
});

Deno.test("GeoPackage - Auto-update bounds on insert", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  // Initially, no bounds
  let content = gpkg.getContent("points");
  assertExists(content);
  assertEquals(content.bounds, undefined);

  // Insert first feature
  gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [10, 20] },
    properties: { name: "First" },
  });

  // Bounds should now be set to the single point
  content = gpkg.getContent("points");
  assertExists(content);
  assertExists(content.bounds);
  assertEquals(content.bounds.minX, 10);
  assertEquals(content.bounds.maxX, 10);
  assertEquals(content.bounds.minY, 20);
  assertEquals(content.bounds.maxY, 20);

  // Insert second feature that expands bounds
  gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [-5, 30] },
    properties: { name: "Second" },
  });

  // Bounds should now encompass both points
  content = gpkg.getContent("points");
  assertExists(content);
  assertExists(content.bounds);
  assertEquals(content.bounds.minX, -5);
  assertEquals(content.bounds.maxX, 10);
  assertEquals(content.bounds.minY, 20);
  assertEquals(content.bounds.maxY, 30);

  gpkg.close();
});

Deno.test("GeoPackage - Auto-update bounds on delete", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  // Insert two features
  const id1 = gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { name: "Origin" },
  });
  gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [100, 100] },
    properties: { name: "Far" },
  });

  // Verify initial bounds include both points
  let content = gpkg.getContent("points");
  assertExists(content?.bounds);
  assertEquals(content.bounds.maxX, 100);
  assertEquals(content.bounds.maxY, 100);

  // Delete the far point
  gpkg.deleteFeature("points", id1 + 1); // Second feature

  // Bounds should now be just the origin point
  content = gpkg.getContent("points");
  assertExists(content?.bounds);
  assertEquals(content.bounds.minX, 0);
  assertEquals(content.bounds.maxX, 0);
  assertEquals(content.bounds.minY, 0);
  assertEquals(content.bounds.maxY, 0);

  gpkg.close();
});

Deno.test("GeoPackage - Auto-update bounds on geometry update", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  const id = gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [10, 10] },
    properties: { name: "Moving" },
  });

  // Verify initial bounds
  let content = gpkg.getContent("points");
  assertExists(content?.bounds);
  assertEquals(content.bounds.minX, 10);
  assertEquals(content.bounds.maxX, 10);

  // Update geometry to new location
  gpkg.updateFeature("points", id, {
    geometry: { type: "Point", coordinates: [50, 50] },
  });

  // Bounds should reflect new location
  content = gpkg.getContent("points");
  assertExists(content?.bounds);
  assertEquals(content.bounds.minX, 50);
  assertEquals(content.bounds.maxX, 50);
  assertEquals(content.bounds.minY, 50);
  assertEquals(content.bounds.maxY, 50);

  gpkg.close();
});

Deno.test("GeoPackage - Export to GeoJSON", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "cities",
    geometryType: "POINT",
    srsId: 4326,
    columns: [
      { name: "name", type: "TEXT" },
      { name: "population", type: "INTEGER" },
    ],
  });

  gpkg.insertFeature("cities", {
    geometry: { type: "Point", coordinates: [-122.4, 37.8] },
    properties: { name: "San Francisco", population: 884363 },
  });
  gpkg.insertFeature("cities", {
    geometry: { type: "Point", coordinates: [-118.2, 34.0] },
    properties: { name: "Los Angeles", population: 3979576 },
  });

  // Export to GeoJSON
  const geojson = gpkg.toGeoJSON("cities");

  assertEquals(geojson.type, "FeatureCollection");
  assertEquals(geojson.features.length, 2);
  assertEquals(geojson.features[0].type, "Feature");
  assertEquals(geojson.features[0].geometry?.type, "Point");
  assertEquals(geojson.features[0].properties.name, "San Francisco");

  gpkg.close();
});

Deno.test("GeoPackage - Export to GeoJSON with CRS and bbox", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
  });

  gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });
  gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [10, 10] },
    properties: {},
  });

  // Export with CRS and bbox
  const geojson = gpkg.toGeoJSON("points", {
    includeCRS: true,
    includeBBox: true,
  });

  assertEquals(geojson.type, "FeatureCollection");
  assertExists(geojson.crs);
  assertEquals(geojson.crs?.type, "name");
  assertEquals(geojson.crs?.properties.name, "urn:ogc:def:crs:EPSG::4326");

  assertExists(geojson.bbox);
  assertEquals(geojson.bbox, [0, 0, 10, 10]);

  gpkg.close();
});

Deno.test("GeoPackage - Import from GeoJSON", () => {
  const gpkg = new GeoPackage(":memory:");

  const geojson: GeoJSONFeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-122.4, 37.8] },
        properties: { name: "San Francisco", rating: 4.5 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-118.2, 34.0] },
        properties: { name: "Los Angeles", rating: 4.0 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-73.9, 40.7] },
        properties: { name: "New York", rating: 4.8 },
      },
    ],
  };

  // Import GeoJSON
  const result = gpkg.fromGeoJSON(geojson, {
    tableName: "imported_cities",
  });

  assertEquals(result.tableName, "imported_cities");
  assertEquals(result.insertedCount, 3);

  // Verify imported data
  const features = gpkg.queryFeatures("imported_cities");
  assertEquals(features.length, 3);

  const sf = features.find((f) => f.properties.name === "San Francisco");
  assertExists(sf);
  assertEquals(sf.geometry?.type, "Point");
  assertEquals(sf.properties.rating, 4.5);

  // Check content type
  const content = gpkg.getContent("imported_cities");
  assertExists(content);
  assertEquals(content.dataType, "features");

  gpkg.close();
});

Deno.test("GeoPackage - GeoJSON round-trip", () => {
  const gpkg = new GeoPackage(":memory:");

  // Create and populate table
  gpkg.createFeatureTable({
    tableName: "polygons",
    geometryType: "POLYGON",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  gpkg.insertFeature("polygons", {
    geometry: {
      type: "Polygon",
      coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    },
    properties: { name: "Square" },
  });

  // Export to GeoJSON
  const exported = gpkg.toGeoJSON("polygons");

  // Import into new table
  const result = gpkg.fromGeoJSON(exported, {
    tableName: "polygons_copy",
  });

  assertEquals(result.insertedCount, 1);

  // Verify data matches
  const original = gpkg.queryFeatures("polygons");
  const copied = gpkg.queryFeatures("polygons_copy");

  assertEquals(original.length, copied.length);
  assertEquals(original[0].geometry?.type, copied[0].geometry?.type);
  assertEquals(original[0].properties.name, copied[0].properties.name);

  gpkg.close();
});

Deno.test("GeoPackage - Import GeoJSON with mixed geometry types", () => {
  const gpkg = new GeoPackage(":memory:");

  const geojson: GeoJSONFeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [0, 0] },
        properties: { type: "point" },
      },
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
        properties: { type: "line" },
      },
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        },
        properties: { type: "polygon" },
      },
    ],
  };

  // Should create table with GEOMETRY type
  const result = gpkg.fromGeoJSON(geojson, {
    tableName: "mixed",
  });

  assertEquals(result.insertedCount, 3);

  // Verify geometry column type is GEOMETRY
  const geomCol = gpkg.getGeometryColumn("mixed");
  assertExists(geomCol);
  assertEquals(geomCol.geometryTypeName, "GEOMETRY");

  gpkg.close();
});

Deno.test("GeoPackage - Import GeoJSON with CRS", () => {
  const gpkg = new GeoPackage(":memory:");

  const geojson: GeoJSONFeatureCollection = {
    type: "FeatureCollection",
    crs: {
      type: "name",
      properties: { name: "urn:ogc:def:crs:EPSG::3857" },
    },
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [0, 0] },
        properties: {},
      },
    ],
  };

  // Import should detect SRS from CRS property
  const result = gpkg.fromGeoJSON(geojson, {
    tableName: "with_crs",
  });

  assertEquals(result.insertedCount, 1);

  // Verify SRS was detected
  const geomCol = gpkg.getGeometryColumn("with_crs");
  assertExists(geomCol);
  assertEquals(geomCol.srsId, 3857);

  gpkg.close();
});

Deno.test("GeoPackage - Create and use spatial index", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "indexed_points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  // Initially no spatial index
  assertEquals(gpkg.hasSpatialIndex("indexed_points"), false);

  // Create spatial index
  gpkg.createSpatialIndex("indexed_points");
  assertEquals(gpkg.hasSpatialIndex("indexed_points"), true);

  // Insert features - should auto-update index
  gpkg.insertFeature("indexed_points", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { name: "Origin" },
  });
  gpkg.insertFeature("indexed_points", {
    geometry: { type: "Point", coordinates: [10, 10] },
    properties: { name: "Northeast" },
  });
  gpkg.insertFeature("indexed_points", {
    geometry: { type: "Point", coordinates: [-50, -50] },
    properties: { name: "Southwest" },
  });

  // Query with bounds - should use spatial index
  const bounds: BoundingBox = {
    minX: -5,
    minY: -5,
    maxX: 15,
    maxY: 15,
  };

  const filtered = gpkg.queryFeatures("indexed_points", { bounds });
  assertEquals(filtered.length, 2);

  const names = filtered.map((f) => f.properties.name).sort();
  assertEquals(names, ["Northeast", "Origin"]);

  gpkg.close();
});

Deno.test("GeoPackage - Spatial index maintained on update", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "moving_points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  gpkg.createSpatialIndex("moving_points");

  // Insert a point
  const id = gpkg.insertFeature("moving_points", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { name: "Moving" },
  });

  // Query for point at origin
  let results = gpkg.queryFeatures("moving_points", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 1);

  // Move the point far away
  gpkg.updateFeature("moving_points", id, {
    geometry: { type: "Point", coordinates: [100, 100] },
  });

  // Query at origin should return nothing now
  results = gpkg.queryFeatures("moving_points", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 0);

  // Query at new location should find it
  results = gpkg.queryFeatures("moving_points", {
    bounds: { minX: 99, minY: 99, maxX: 101, maxY: 101 },
  });
  assertEquals(results.length, 1);

  gpkg.close();
});

Deno.test("GeoPackage - Spatial index maintained on delete", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "deletable_points",
    geometryType: "POINT",
    srsId: 4326,
  });

  gpkg.createSpatialIndex("deletable_points");

  // Insert two points
  const id1 = gpkg.insertFeature("deletable_points", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });
  gpkg.insertFeature("deletable_points", {
    geometry: { type: "Point", coordinates: [10, 10] },
    properties: {},
  });

  // Both should be found
  let results = gpkg.queryFeatures("deletable_points", {
    bounds: { minX: -5, minY: -5, maxX: 15, maxY: 15 },
  });
  assertEquals(results.length, 2);

  // Delete one
  gpkg.deleteFeature("deletable_points", id1);

  // Only one should remain
  results = gpkg.queryFeatures("deletable_points", {
    bounds: { minX: -5, minY: -5, maxX: 15, maxY: 15 },
  });
  assertEquals(results.length, 1);

  gpkg.close();
});

Deno.test("GeoPackage - Drop spatial index", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "temp_indexed",
    geometryType: "POINT",
    srsId: 4326,
  });

  gpkg.createSpatialIndex("temp_indexed");
  assertEquals(gpkg.hasSpatialIndex("temp_indexed"), true);

  gpkg.dropSpatialIndex("temp_indexed");
  assertEquals(gpkg.hasSpatialIndex("temp_indexed"), false);

  // Queries should still work (without index)
  gpkg.insertFeature("temp_indexed", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });

  const results = gpkg.queryFeatures("temp_indexed", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 1);

  gpkg.close();
});

Deno.test("GeoPackage - Rebuild spatial index", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "rebuild_test",
    geometryType: "POINT",
    srsId: 4326,
  });

  // Insert features before creating index
  gpkg.insertFeature("rebuild_test", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });
  gpkg.insertFeature("rebuild_test", {
    geometry: { type: "Point", coordinates: [10, 10] },
    properties: {},
  });

  // Create index (should auto-populate from existing data)
  gpkg.createSpatialIndex("rebuild_test");

  // Query should work with existing data
  let results = gpkg.queryFeatures("rebuild_test", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 1);

  // Rebuild index
  gpkg.rebuildSpatialIndex("rebuild_test");

  // Should still work
  results = gpkg.queryFeatures("rebuild_test", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 1);

  gpkg.close();
});

Deno.test("GeoPackage - Spatial index error handling", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "index_errors",
    geometryType: "POINT",
    srsId: 4326,
  });

  // Cannot drop non-existent index
  assertThrows(
    () => gpkg.dropSpatialIndex("index_errors"),
    Error,
    "does not exist",
  );

  // Create index
  gpkg.createSpatialIndex("index_errors");

  // Cannot create duplicate index
  assertThrows(
    () => gpkg.createSpatialIndex("index_errors"),
    Error,
    "already exists",
  );

  gpkg.close();
});
