/**
 * Basic usage example for @nullstyle/gpkg
 */

import { GeoPackage } from "../mod.ts";

const fileStat = Deno.statSync("example.gpkg");
if (fileStat.isFile) {
  console.log("removing existing file");
  Deno.removeSync("example.gpkg");
}

// Create a new GeoPackage
const gpkg = new GeoPackage("example.gpkg");

console.log("Creating feature table...");

// Create a feature table for points of interest
gpkg.createFeatureTable({
  tableName: "poi",
  geometryType: "POINT",
  srsId: 4326, // WGS 84
  columns: [
    { name: "name", type: "TEXT", notNull: true },
    { name: "category", type: "TEXT" },
    { name: "rating", type: "REAL" },
  ],
});

console.log("Inserting features...");

// Insert some points of interest
const locations = [
  {
    name: "Golden Gate Bridge",
    category: "Landmark",
    rating: 4.8,
    coordinates: [-122.4783, 37.8199],
  },
  {
    name: "Alcatraz Island",
    category: "Historic Site",
    rating: 4.7,
    coordinates: [-122.4230, 37.8267],
  },
  {
    name: "Fisherman's Wharf",
    category: "Tourist Attraction",
    rating: 4.3,
    coordinates: [-122.4177, 37.8080],
  },
  {
    name: "Lombard Street",
    category: "Landmark",
    rating: 4.5,
    coordinates: [-122.4187, 37.8021],
  },
];

for (const location of locations) {
  gpkg.insertFeature("poi", {
    geometry: {
      type: "Point",
      coordinates: location.coordinates,
    },
    properties: {
      name: location.name,
      category: location.category,
      rating: location.rating,
    },
  });
}

console.log(`Inserted ${locations.length} features`);

// Query all features
console.log("\nAll points of interest:");
const allPoi = gpkg.queryFeatures("poi");
for (const feature of allPoi) {
  console.log(
    `- ${feature.properties.name} (${feature.properties.category}): ${feature.properties.rating}★`,
  );
}

// Query features with filter
console.log("\nHighly rated locations (>= 4.5):");
const highRated = gpkg.queryFeatures("poi", {
  where: "rating >= 4.5",
  orderBy: "rating DESC",
});
for (const feature of highRated) {
  console.log(`- ${feature.properties.name}: ${feature.properties.rating}★`);
}

// Query landmarks only
console.log("\nLandmarks:");
const landmarks = gpkg.queryFeatures("poi", {
  where: "category = 'Landmark'",
});
for (const feature of landmarks) {
  console.log(`- ${feature.properties.name}`);
}

// Calculate bounding box
const bounds = gpkg.calculateFeatureBounds("poi");
if (bounds) {
  console.log("\nBounding box:");
  console.log(`  Min: [${bounds.minX.toFixed(4)}, ${bounds.minY.toFixed(4)}]`);
  console.log(`  Max: [${bounds.maxX.toFixed(4)}, ${bounds.maxY.toFixed(4)}]`);
}

// Update a feature
const firstFeature = allPoi[0];
if (firstFeature.id) {
  console.log(`\nUpdating ${firstFeature.properties.name}...`);
  gpkg.updateFeature("poi", firstFeature.id, {
    properties: { rating: 5.0 },
  });
  console.log("Updated rating to 5.0");
}

// Count features
const count = gpkg.countFeatures("poi");
console.log(`\nTotal features: ${count}`);

// List contents
console.log("\nGeoPackage contents:");
const contents = gpkg.listContents();
for (const content of contents) {
  console.log(`- ${content.tableName} (${content.dataType})`);
}

// Close the database
gpkg.close();
console.log("\nGeoPackage closed successfully");
