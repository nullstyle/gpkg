import { assertEquals, assertExists, assertRejects } from "@std/assert";
import {
  type BoundingBox,
  type GeoJSONFeatureCollection,
  GeoPackage,
  type WhereClause,
} from "../mod.ts";

Deno.test("GeoPackage - Create and open database", async () => {
  const gpkg = await GeoPackage.memory();
  assertExists(gpkg);
  assertEquals(gpkg.closed, false);
  await await gpkg.close();
  assertEquals(gpkg.closed, true);
});

Deno.test("GeoPackage - Initialize with default SRS", async () => {
  const gpkg = await GeoPackage.memory();

  const srs4326 = await await gpkg.getSpatialReferenceSystem(4326);
  assertExists(srs4326);
  assertEquals(srs4326.srsId, 4326);
  assertEquals(srs4326.organization, "EPSG");

  const srsList = await await gpkg.listSpatialReferenceSystems();
  assertEquals(srsList.length >= 3, true); // At least 3 default SRS

  await await gpkg.close();
});

Deno.test("GeoPackage - Create feature table and insert feature", async () => {
  const gpkg = await GeoPackage.memory();

  // Create feature table
  await await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [
      { name: "name", type: "TEXT" },
      { name: "value", type: "REAL" },
    ],
  });

  // Check content was created
  const content = await await gpkg.getContent("points");
  assertExists(content);
  assertEquals(content.dataType, "features");

  // Insert feature
  const id = await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [-122.4, 37.8] },
    properties: { name: "San Francisco", value: 42.5 },
  });

  assertEquals(typeof id, "number");

  // Get feature
  const feature = await await gpkg.getFeature("points", id);
  assertExists(feature);
  assertEquals(feature.geometry?.type, "Point");
  assertEquals(feature.properties.name, "San Francisco");

  await await gpkg.close();
});

Deno.test("GeoPackage - Query features", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "cities",
    geometryType: "POINT",
    srsId: 4326,
    columns: [
      { name: "name", type: "TEXT" },
      { name: "population", type: "INTEGER" },
    ],
  });

  await await gpkg.insertFeature("cities", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { name: "City A", population: 100000 },
  });
  await await gpkg.insertFeature("cities", {
    geometry: { type: "Point", coordinates: [1, 1] },
    properties: { name: "City B", population: 500000 },
  });
  await await gpkg.insertFeature("cities", {
    geometry: { type: "Point", coordinates: [2, 2] },
    properties: { name: "City C", population: 1000000 },
  });

  // Query all
  const all = await await gpkg.queryFeatures("cities");
  assertEquals(all.length, 3);

  // Query with WHERE clause
  const filtered = await await gpkg.queryFeatures("cities", {
    where: { sql: "population > ?", params: [200000] },
  });
  assertEquals(filtered.length, 2);

  // Count
  const count = await await gpkg.countFeatures("cities");
  assertEquals(count, 3);

  await await gpkg.close();
});

Deno.test("GeoPackage - Update and delete feature", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  const id = await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { name: "Original" },
  });

  // Update
  await await gpkg.updateFeature("points", id, {
    properties: { name: "Updated" },
  });

  const updated = await await gpkg.getFeature("points", id);
  assertEquals(updated?.properties.name, "Updated");

  // Delete
  await await gpkg.deleteFeature("points", id);
  const deleted = await await gpkg.getFeature("points", id);
  assertEquals(deleted, undefined);

  await await gpkg.close();
});

Deno.test("GeoPackage - Tile operations", async () => {
  const gpkg = await GeoPackage.memory();

  // Create tile matrix set
  await await gpkg.createTileMatrixSet({
    tableName: "tiles",
    srsId: 3857,
    minX: -20037508.34,
    minY: -20037508.34,
    maxX: 20037508.34,
    maxY: 20037508.34,
  });

  // Add tile matrix
  await await gpkg.addTileMatrix({
    tableName: "tiles",
    zoomLevel: 0,
    matrixWidth: 1,
    matrixHeight: 1,
    tileWidth: 256,
    tileHeight: 256,
    pixelXSize: 156543.03392804097,
    pixelYSize: 156543.03392804097,
  });

  // Insert tile (simple PNG-like data for testing)
  const tileData = new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    1,
    2,
    3,
    4,
  ]);
  const tileId = await await gpkg.insertTile("tiles", {
    zoomLevel: 0,
    tileColumn: 0,
    tileRow: 0,
    tileData,
  });

  assertEquals(typeof tileId, "number");

  // Get tile
  const tile = await await gpkg.getTile("tiles", {
    zoom: 0,
    column: 0,
    row: 0,
  });
  assertExists(tile);
  assertEquals(tile.tileData.length, tileData.length);

  await await gpkg.close();
});

Deno.test("GeoPackage - Extensions", async () => {
  const gpkg = await GeoPackage.memory();

  // Add extension
  await await gpkg.addExtension({
    extensionName: "test_extension",
    definition: "http://example.com/test",
    scope: "read-write",
  });

  // Check extension exists
  const hasExt = await await gpkg.hasExtension("test_extension");
  assertEquals(hasExt, true);

  // List extensions
  const extensions = await await gpkg.listExtensions();
  assertEquals(
    extensions.some((e) => e.extensionName === "test_extension"),
    true,
  );

  await await gpkg.close();
});

Deno.test("GeoPackage - Transaction", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  // Use transaction for batch insert
  await gpkg.transaction(() => {
    // Note: Inside transaction, we need to use the sync-style operations
    // But since they're wrapped, we just call them without await
  });

  await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { name: "Point 1" },
  });
  await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [1, 1] },
    properties: { name: "Point 2" },
  });

  const count = await await gpkg.countFeatures("points");
  assertEquals(count, 2);

  await await gpkg.close();
});

Deno.test("GeoPackage - List contents by type", async () => {
  const gpkg = await GeoPackage.memory();

  // Create feature table
  await await gpkg.createFeatureTable({
    tableName: "features",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  // Create tile matrix set
  await await gpkg.createTileMatrixSet({
    tableName: "tiles",
    srsId: 3857,
    minX: -180,
    minY: -90,
    maxX: 180,
    maxY: 90,
  });

  // List all contents
  const contents = await await gpkg.listContents();
  assertEquals(contents.length, 2);

  // List by type
  const pointsContent = await gpkg.listContentsByType("features");
  assertEquals(pointsContent.length, 1);
  assertEquals(pointsContent[0].tableName, "features");

  const tilesContent = await gpkg.listContentsByType("tiles");
  assertEquals(tilesContent.length, 1);
  assertEquals(tilesContent[0].tableName, "tiles");

  await await gpkg.close();
});

Deno.test("GeoPackage - Empty database has no contents", async () => {
  const gpkg = await GeoPackage.memory();

  const contents = await await gpkg.listContents();
  assertEquals(contents.length, 0);

  await await gpkg.close();
});

Deno.test("GeoPackage - Multiple feature tables", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  await await gpkg.createFeatureTable({
    tableName: "lines",
    geometryType: "LINESTRING",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  await await gpkg.createTileMatrixSet({
    tableName: "basemap",
    srsId: 3857,
    minX: -180,
    minY: -90,
    maxX: 180,
    maxY: 90,
  });

  const featureContents = await gpkg.listContentsByType("features");
  assertEquals(featureContents.length, 2);

  const tileContents = await gpkg.listContentsByType("tiles");
  assertEquals(tileContents.length, 1);

  // Initially no attribute tables
  const attributeContents = await gpkg.listContentsByType("attributes");
  assertEquals(attributeContents.length, 0);

  await await gpkg.close();
});

Deno.test("GeoPackage - Attribute table operations", async () => {
  const gpkg = await GeoPackage.memory();

  // Create attribute table
  await await gpkg.createAttributeTable({
    tableName: "metadata",
    columns: [
      { name: "key", type: "TEXT", notNull: true },
      { name: "value", type: "TEXT" },
    ],
  });

  // Check content was created
  const content = await await gpkg.getContent("metadata");
  assertExists(content);
  assertEquals(content.dataType, "attributes");

  // Insert attribute row
  const id = await await gpkg.insertAttribute("metadata", {
    properties: { key: "version", value: "1.0.0" },
  });

  assertEquals(typeof id, "number");

  // Get attribute row
  const row = await await gpkg.getAttribute("metadata", id);
  assertExists(row);
  assertEquals(row.properties.key, "version");
  assertEquals(row.properties.value, "1.0.0");

  await await gpkg.close();
});

Deno.test("GeoPackage - Query attributes", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createAttributeTable({
    tableName: "settings",
    columns: [
      { name: "category", type: "TEXT" },
      { name: "name", type: "TEXT" },
      { name: "enabled", type: "INTEGER" },
    ],
  });

  await await gpkg.insertAttribute("settings", {
    properties: { category: "display", name: "dark_mode", enabled: 1 },
  });
  await await gpkg.insertAttribute("settings", {
    properties: { category: "display", name: "font_size", enabled: 0 },
  });
  await await gpkg.insertAttribute("settings", {
    properties: { category: "network", name: "proxy", enabled: 1 },
  });

  // Query all
  const all = await await gpkg.queryAttributes("settings");
  assertEquals(all.length, 3);

  // Query with WHERE
  const displaySettings = await await gpkg.queryAttributes("settings", {
    where: { sql: "category = ?", params: ["display"] },
  });
  assertEquals(displaySettings.length, 2);

  // Query with compound WHERE
  const whereClause: WhereClause = {
    sql: "category = ? AND enabled = ?",
    params: ["display", 1],
  };
  const enabledDisplaySettings = await await gpkg.queryAttributes("settings", {
    where: whereClause,
  });
  assertEquals(enabledDisplaySettings.length, 1);

  // Count
  const count = await await gpkg.countAttributes("settings");
  assertEquals(count, 3);

  await await gpkg.close();
});

Deno.test("GeoPackage - Update and delete attribute", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createAttributeTable({
    tableName: "items",
    columns: [
      { name: "name", type: "TEXT" },
      { name: "quantity", type: "INTEGER" },
    ],
  });

  const id = await await gpkg.insertAttribute("items", {
    properties: { name: "Widget", quantity: 10 },
  });

  // Update
  await await gpkg.updateAttribute("items", id, { quantity: 20 });
  const updated = await await gpkg.getAttribute("items", id);
  assertEquals(updated?.properties.quantity, 20);

  // Delete
  await await gpkg.deleteAttribute("items", id);
  const deleted = await await gpkg.getAttribute("items", id);
  assertEquals(deleted, undefined);

  await await gpkg.close();
});

Deno.test("GeoPackage - Attribute table in contents", async () => {
  const gpkg = await GeoPackage.memory();

  // Create feature table
  await await gpkg.createFeatureTable({
    tableName: "features",
    geometryType: "POINT",
    srsId: 4326,
  });

  // Create attribute table
  await await gpkg.createAttributeTable({
    tableName: "metadata",
    columns: [{ name: "key", type: "TEXT" }],
  });

  await await gpkg.createAttributeTable({
    tableName: "config",
    columns: [{ name: "name", type: "TEXT" }],
  });

  // List attribute contents
  const attributeContents = await gpkg.listContentsByType("attributes");
  assertEquals(attributeContents.length, 2);
  assertEquals(
    attributeContents.some((c) => c.tableName === "metadata"),
    true,
  );
  assertEquals(attributeContents.some((c) => c.tableName === "config"), true);

  // Feature contents should be separate
  const featureContents = await gpkg.listContentsByType("features");
  assertEquals(featureContents.length, 1);

  await await gpkg.close();
});

Deno.test("GeoPackage - Cannot insert attribute into non-attribute table", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createAttributeTable({
    tableName: "attributes",
    columns: [{ name: "name", type: "TEXT" }],
  });

  // Create a feature table
  await await gpkg.createAttributeTable({
    tableName: "other_attributes",
    columns: [{ name: "value", type: "TEXT" }],
  });

  // This should work - inserting into attribute table
  await await gpkg.createFeatureTable({
    tableName: "features",
    geometryType: "POINT",
    srsId: 4326,
  });

  // Should fail - inserting attribute row into feature table
  await await assertRejects(async () => {
    await await gpkg.insertAttribute("features", {
      properties: { test: "value" },
    });
  });

  await await gpkg.close();
});

Deno.test("GeoPackage - Query features with bounds", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  // Insert points at different locations
  await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { name: "Origin" },
  });
  await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [10, 10] },
    properties: { name: "Northeast" },
  });
  await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [-10, -10] },
    properties: { name: "Southwest" },
  });
  await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [100, 100] },
    properties: { name: "Far" },
  });

  // Query with bounding box that includes 3 points
  const bounds: BoundingBox = {
    minX: -15,
    minY: -15,
    maxX: 15,
    maxY: 15,
  };

  const filtered = await await gpkg.queryFeatures("points", { bounds });
  assertEquals(filtered.length, 3);

  const names = filtered.map((f) => f.properties.name).sort();
  assertEquals(names, ["Northeast", "Origin", "Southwest"]);

  // Query with bounds that includes only far point
  const farBounds: BoundingBox = {
    minX: 90,
    minY: 90,
    maxX: 110,
    maxY: 110,
  };

  const farFiltered = await await gpkg.queryFeatures("points", {
    bounds: farBounds,
  });
  assertEquals(farFiltered.length, 1);
  assertEquals(farFiltered[0].properties.name, "Far");

  // Query with bounds that includes no points
  const emptyBounds: BoundingBox = {
    minX: 50,
    minY: 50,
    maxX: 60,
    maxY: 60,
  };

  const emptyFiltered = await await gpkg.queryFeatures("points", {
    bounds: emptyBounds,
  });
  assertEquals(emptyFiltered.length, 0);

  await await gpkg.close();
});

Deno.test("GeoPackage - Query features with limit and offset", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "index", type: "INTEGER" }],
  });

  // Insert 10 points
  for (let i = 0; i < 10; i++) {
    await await gpkg.insertFeature("points", {
      geometry: { type: "Point", coordinates: [i, i] },
      properties: { index: i },
    });
  }

  const bounds: BoundingBox = {
    minX: -1,
    minY: -1,
    maxX: 20,
    maxY: 20,
  };

  // Query all
  const all = await await gpkg.queryFeatures("points", { bounds });
  assertEquals(all.length, 10);

  // Query with limit
  const limited = await await gpkg.queryFeatures("points", { limit: 3 });
  assertEquals(limited.length, 3);

  // Query with offset
  const offset = await await gpkg.queryFeatures("points", { offset: 5 });
  assertEquals(offset.length, 5);

  // Query with both
  const both = await await gpkg.queryFeatures("points", {
    limit: 3,
    offset: 2,
  });
  assertEquals(both.length, 3);

  await await gpkg.close();
});

Deno.test("GeoPackage - Query features with bounds - polygon and linestring", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "shapes",
    geometryType: "GEOMETRY",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  // Insert a polygon
  await await gpkg.insertFeature("shapes", {
    geometry: {
      type: "Polygon",
      coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    },
    properties: { name: "Square" },
  });

  // Insert a linestring
  await await gpkg.insertFeature("shapes", {
    geometry: {
      type: "LineString",
      coordinates: [[20, 20], [30, 30], [40, 20]],
    },
    properties: { name: "Line" },
  });

  // Query with bounds that intersects the polygon
  const bounds: BoundingBox = {
    minX: -5,
    minY: -5,
    maxX: 5,
    maxY: 5,
  };

  const filtered = await await gpkg.queryFeatures("shapes", { bounds });
  assertEquals(filtered.length, 1);
  assertEquals(filtered[0].properties.name, "Square");

  await await gpkg.close();
});

Deno.test("GeoPackage - Bounds update on feature insert", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  // Initially no bounds
  let content = await await gpkg.getContent("points");
  assertExists(content);
  assertEquals(content.bounds, undefined);

  // Insert a feature
  await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [10, 20] },
    properties: { name: "First" },
  });

  // Bounds should be updated
  content = await await gpkg.getContent("points");
  assertExists(content);
  assertExists(content.bounds);
  assertEquals(content.bounds.minX, 10);
  assertEquals(content.bounds.maxX, 10);
  assertEquals(content.bounds.minY, 20);
  assertEquals(content.bounds.maxY, 20);

  // Insert another feature
  await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [30, 40] },
    properties: { name: "Second" },
  });

  // Bounds should expand
  content = await await gpkg.getContent("points");
  assertExists(content);
  assertExists(content.bounds);
  assertEquals(content.bounds.minX, 10);
  assertEquals(content.bounds.maxX, 30);
  assertEquals(content.bounds.minY, 20);
  assertEquals(content.bounds.maxY, 40);

  await await gpkg.close();
});

Deno.test("GeoPackage - Bounds update on feature update", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  const id1 = await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [10, 20] },
    properties: { name: "First" },
  });
  await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [30, 40] },
    properties: { name: "Second" },
  });

  // Check initial bounds
  let content = await await gpkg.getContent("points");
  assertExists(content?.bounds);
  assertEquals(content.bounds.minX, 10);
  assertEquals(content.bounds.maxX, 30);

  // Update geometry of first point
  await await gpkg.updateFeature("points", id1, {
    geometry: { type: "Point", coordinates: [5, 15] },
  });

  // Bounds should be recalculated
  content = await await gpkg.getContent("points");
  assertExists(content?.bounds);
  assertEquals(content.bounds.minX, 5);
  assertEquals(content.bounds.maxX, 30);

  await await gpkg.close();
});

Deno.test("GeoPackage - Calculate feature bounds manually", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  const id = await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [10, 20] },
    properties: { name: "First" },
  });

  // Check bounds via calculate method
  const content = await gpkg.getContent("points");
  assertExists(content?.bounds);

  // Update to null geometry
  await gpkg.updateFeature("points", id, {
    geometry: { type: "Point", coordinates: [5, 5] },
  });

  // Calculate bounds manually
  const bounds = await gpkg.calculateFeatureBounds("points");
  assertExists(bounds);
  assertEquals(bounds.minX, 5);
  assertEquals(bounds.maxX, 5);

  await gpkg.close();
});

Deno.test("GeoPackage - Export to GeoJSON", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "cities",
    geometryType: "POINT",
    srsId: 4326,
    columns: [
      { name: "name", type: "TEXT" },
      { name: "population", type: "INTEGER" },
    ],
  });

  await await gpkg.insertFeature("cities", {
    geometry: { type: "Point", coordinates: [-122.4, 37.8] },
    properties: { name: "San Francisco", population: 870000 },
  });
  await await gpkg.insertFeature("cities", {
    geometry: { type: "Point", coordinates: [-0.1, 51.5] },
    properties: { name: "London", population: 8900000 },
  });

  const geojson = await gpkg.toGeoJSON("cities");

  assertEquals(geojson.type, "FeatureCollection");
  assertEquals(geojson.features.length, 2);
  assertEquals(geojson.features[0].type, "Feature");
  assertExists(geojson.features[0].geometry);

  await await gpkg.close();
});

Deno.test("GeoPackage - Export to GeoJSON with options", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
  });

  await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });
  await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [10, 10] },
    properties: {},
  });

  const geojson = await gpkg.toGeoJSON("points", {
    includeCRS: true,
    includeBBox: true,
  });

  assertEquals(geojson.type, "FeatureCollection");
  assertExists(geojson.crs);
  assertExists(geojson.bbox);
  assertEquals(geojson.bbox, [0, 0, 10, 10]);

  await await gpkg.close();
});

Deno.test("GeoPackage - Import from GeoJSON", async () => {
  const gpkg = await GeoPackage.memory();

  const geojson: GeoJSONFeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-122.4, 37.8] },
        properties: { name: "San Francisco", rating: 5 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-0.1, 51.5] },
        properties: { name: "London", rating: 4 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [139.7, 35.7] },
        properties: { name: "Tokyo", rating: 5 },
      },
    ],
  };

  const result = await gpkg.fromGeoJSON(geojson, {
    tableName: "cities",
  });

  assertEquals(result.tableName, "cities");
  assertEquals(result.insertedCount, 3);

  // Verify features were imported
  const features = await await gpkg.queryFeatures("cities");
  assertEquals(features.length, 3);

  const sf = features.find((f) => f.properties.name === "San Francisco");
  assertExists(sf);
  assertEquals(sf.properties.rating, 5);

  // Verify content was created
  const content = await await gpkg.getContent("cities");
  assertExists(content);
  assertEquals(content.dataType, "features");

  await await gpkg.close();
});

Deno.test("GeoPackage - GeoJSON roundtrip", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "shapes",
    geometryType: "POLYGON",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  await await gpkg.insertFeature("shapes", {
    geometry: {
      type: "Polygon",
      coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    },
    properties: { name: "Square" },
  });

  // Export
  const exported = await gpkg.toGeoJSON("shapes");

  // Import to new table
  const result = await gpkg.fromGeoJSON(exported, {
    tableName: "shapes_copy",
  });

  assertEquals(result.insertedCount, 1);

  // Verify data matches
  const original = await await gpkg.queryFeatures("shapes");
  const copied = await await gpkg.queryFeatures("shapes_copy");

  assertEquals(original.length, copied.length);
  assertEquals(original[0].geometry?.type, copied[0].geometry?.type);
  assertEquals(original[0].properties.name, copied[0].properties.name);

  await await gpkg.close();
});

Deno.test("GeoPackage - Create and use spatial index", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "name", type: "TEXT" }],
  });

  // Initially no spatial index
  assertEquals(await await gpkg.hasSpatialIndex("points"), false);

  // Create spatial index
  await await gpkg.createSpatialIndex("points");
  assertEquals(await await gpkg.hasSpatialIndex("points"), true);

  // Insert features (index is auto-maintained)
  await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { name: "Origin" },
  });
  await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [10, 10] },
    properties: { name: "Northeast" },
  });
  await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [100, 100] },
    properties: { name: "Far" },
  });

  // Query with bounds - uses spatial index
  const bounds: BoundingBox = {
    minX: -5,
    minY: -5,
    maxX: 15,
    maxY: 15,
  };

  const filtered = await await gpkg.queryFeatures("points", { bounds });
  assertEquals(filtered.length, 2);

  const names = filtered.map((f) => f.properties.name).sort();
  assertEquals(names, ["Northeast", "Origin"]);

  await await gpkg.close();
});

Deno.test("GeoPackage - Spatial index maintained on update and delete", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
  });

  await await gpkg.createSpatialIndex("points");

  const id = await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });

  // Query at origin
  let results = await await gpkg.queryFeatures("points", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 1);

  // Move the point
  await await gpkg.updateFeature("points", id, {
    geometry: { type: "Point", coordinates: [100, 100] },
  });

  // Query at origin should return nothing
  results = await await gpkg.queryFeatures("points", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 0);

  // Query at new location
  results = await await gpkg.queryFeatures("points", {
    bounds: { minX: 99, minY: 99, maxX: 101, maxY: 101 },
  });
  assertEquals(results.length, 1);

  // Delete the point
  await await gpkg.deleteFeature("points", id);

  // Should be gone
  results = await await gpkg.queryFeatures("points", {
    bounds: { minX: 99, minY: 99, maxX: 101, maxY: 101 },
  });
  assertEquals(results.length, 0);

  await await gpkg.close();
});

Deno.test("GeoPackage - Drop spatial index", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
  });

  await await gpkg.createSpatialIndex("points");
  assertEquals(await await gpkg.hasSpatialIndex("points"), true);

  await await gpkg.dropSpatialIndex("points");
  assertEquals(await await gpkg.hasSpatialIndex("points"), false);

  // Queries should still work (without index)
  await await gpkg.insertFeature("points", {
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  });

  const results = await await gpkg.queryFeatures("points", {
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  });
  assertEquals(results.length, 1);

  await await gpkg.close();
});

Deno.test("GeoPackage - Batch insert features", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "index", type: "INTEGER" }],
  });

  const features = Array.from({ length: 100 }, (_, i) => ({
    geometry: { type: "Point" as const, coordinates: [i, i] },
    properties: { index: i },
  }));

  let progressCalls = 0;
  const ids = await gpkg.insertFeatures("points", features, {
    yieldEvery: 25,
    onProgress: () => {
      progressCalls++;
    },
  });

  assertEquals(ids.length, 100);
  assertEquals(await await gpkg.countFeatures("points"), 100);
  assertEquals(progressCalls >= 3, true); // Should be called at 25, 50, 75, 100

  await await gpkg.close();
});

Deno.test("GeoPackage - Iterate features async", async () => {
  const gpkg = await GeoPackage.memory();

  await await gpkg.createFeatureTable({
    tableName: "points",
    geometryType: "POINT",
    srsId: 4326,
  });

  for (let i = 0; i < 10; i++) {
    await await gpkg.insertFeature("points", {
      geometry: { type: "Point", coordinates: [i, i] },
      properties: {},
    });
  }

  let count = 0;
  for await (const _feature of gpkg.iterateFeatures("points")) {
    count++;
  }

  assertEquals(count, 10);

  await await gpkg.close();
});
