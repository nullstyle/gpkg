# @nullstyle/gpkg

A lightweight JSR package for interacting with GeoPackage files, built on top of
`jsr:@db/sqlite`.

**WARNING: This was vibe coded using manus. This is just for me, use at your own
extreme risk, here be dragons, etc.**

## Features

- **Lightweight & Focused**: Minimal dependencies, focused on core GeoPackage
  functionality
- **Type-Safe**: Comprehensive TypeScript types and interfaces
- **Standards-Compliant**: Implements OGC GeoPackage 1.3 specification
- **Async API**: Promise-based operations with batch support
- **Feature Support**: Create and manage vector feature tables with geometries
- **Tile Support**: Create and manage raster tile pyramids with format
  validation
- **Attribute Tables**: Non-spatial tables for metadata and related data
- **Spatial Indexing**: R-tree index support for efficient bounding box queries
- **GeoJSON Interop**: Import/export GeoJSON FeatureCollections
- **Schema Extension**: Column metadata with constraints (range, enum, glob)
- **Geometry Validation**: Type and dimension (Z/M) enforcement on insert
- **SQL Injection Safe**: Parameterized queries throughout

## Installation

```bash
deno add jsr:@nullstyle/gpkg
```

Or use directly with JSR specifier:

```typescript
import { GeoPackage } from "jsr:@nullstyle/gpkg";
```

## Quick Start

### Basic Usage

```typescript
import { GeoPackage } from "jsr:@nullstyle/gpkg";

// Open or create a GeoPackage
const gpkg = await GeoPackage.open("mydata.gpkg");

// Create a feature table
await gpkg.createFeatureTable({
  tableName: "cities",
  geometryType: "POINT",
  srsId: 4326, // WGS 84
  columns: [
    { name: "name", type: "TEXT", notNull: true },
    { name: "population", type: "INTEGER" },
  ],
});

// Insert features
await gpkg.insertFeature("cities", {
  geometry: { type: "Point", coordinates: [-122.4194, 37.7749] },
  properties: { name: "San Francisco", population: 873965 },
});

// Query with parameterized WHERE clause (SQL injection safe)
const largeCities = await gpkg.queryFeatures("cities", {
  where: { sql: "population > ?", params: [1000000] },
  orderBy: "population DESC",
});

// Close the database
await gpkg.close();
```

### Batch Operations

```typescript
import { GeoPackage } from "jsr:@nullstyle/gpkg";

const gpkg = await GeoPackage.open("mydata.gpkg");

await gpkg.createFeatureTable({
  tableName: "points",
  geometryType: "POINT",
  srsId: 4326,
});

// Batch insert with progress tracking
const features = generateFeatures(1000);
const ids = await gpkg.insertFeatures("points", features, {
  yieldEvery: 100,
  onProgress: (done, total) => console.log(`${done}/${total}`),
});

// Async iteration
for await (const feature of gpkg.iterateFeatures("points")) {
  console.log(feature.id);
}

await gpkg.close();
```

### Spatial Indexing (R-tree)

```typescript
import { GeoPackage } from "jsr:@nullstyle/gpkg";

const gpkg = await GeoPackage.open("spatial.gpkg");

await gpkg.createFeatureTable({
  tableName: "parcels",
  geometryType: "POLYGON",
  srsId: 4326,
});

// Create spatial index for efficient bounding box queries
await gpkg.createSpatialIndex("parcels");

// Insert features (index is automatically maintained)
await gpkg.insertFeature("parcels", {
  geometry: {
    type: "Polygon",
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
  },
  properties: { parcel_id: "A001" },
});

// Query by bounding box (uses R-tree when available)
const results = await gpkg.queryFeatures("parcels", {
  bounds: { minX: -1, minY: -1, maxX: 2, maxY: 2 },
});

await gpkg.close();
```

### GeoJSON Import/Export

```typescript
import { GeoPackage } from "jsr:@nullstyle/gpkg";

const gpkg = await GeoPackage.open("geojson.gpkg");

// Import GeoJSON FeatureCollection
const geojson = JSON.parse(await Deno.readTextFile("data.geojson"));
const { tableName, insertedCount } = await gpkg.fromGeoJSON(geojson, {
  tableName: "imported_features",
  srsId: 4326,
});

console.log(`Imported ${insertedCount} features into ${tableName}`);

// Export to GeoJSON
const exported = await gpkg.toGeoJSON("imported_features", {
  includeCRS: true,
  includeBBox: true,
});

await Deno.writeTextFile("export.geojson", JSON.stringify(exported));

await gpkg.close();
```

### Attribute Tables (Non-Spatial)

```typescript
import { GeoPackage } from "jsr:@nullstyle/gpkg";

const gpkg = await GeoPackage.open("data.gpkg");

// Create non-spatial attribute table
await gpkg.createAttributeTable({
  tableName: "metadata",
  columns: [
    { name: "key", type: "TEXT", notNull: true, unique: true },
    { name: "value", type: "TEXT" },
  ],
});

// Insert attribute rows
await gpkg.insertAttribute("metadata", {
  properties: { key: "version", value: "1.0.0" },
});

// Query attributes with parameterized WHERE
const rows = await gpkg.queryAttributes("metadata", {
  where: { sql: "key = ?", params: ["version"] },
});

await gpkg.close();
```

### Schema Extension (Data Columns & Constraints)

```typescript
import { GeoPackage } from "jsr:@nullstyle/gpkg";

const gpkg = await GeoPackage.open("schema.gpkg");

await gpkg.createFeatureTable({
  tableName: "sensors",
  geometryType: "POINT",
  srsId: 4326,
  columns: [
    { name: "status", type: "TEXT" },
    { name: "temperature", type: "REAL" },
  ],
});

// Define column metadata
await gpkg.addDataColumn({
  tableName: "sensors",
  columnName: "status",
  name: "status",
  title: "Sensor Status",
  description: "Current operational status",
  constraintName: "status_constraint",
});

// Add enum constraint
await gpkg.addEnumConstraint({
  constraintName: "status_constraint",
  constraintType: "enum",
  value: "active",
});
await gpkg.addEnumConstraint({
  constraintName: "status_constraint",
  constraintType: "enum",
  value: "inactive",
});

// Add range constraint for temperature
await gpkg.addRangeConstraint({
  constraintName: "temp_range",
  constraintType: "range",
  min: -50,
  max: 150,
  minIsInclusive: true,
  maxIsInclusive: true,
});

// Validate values
const isValid = await gpkg.validateValueAgainstConstraint(
  "status_constraint",
  "active",
); // true

await gpkg.close();
```

### Working with Tiles

```typescript
import { GeoPackage } from "jsr:@nullstyle/gpkg";

const gpkg = await GeoPackage.open("tiles.gpkg");

// Create tile matrix set
await gpkg.createTileMatrixSet({
  tableName: "world_tiles",
  srsId: 3857, // Web Mercator
  minX: -20037508.34,
  minY: -20037508.34,
  maxX: 20037508.34,
  maxY: 20037508.34,
});

// Add tile matrix (zoom level)
await gpkg.addTileMatrix({
  tableName: "world_tiles",
  zoomLevel: 0,
  matrixWidth: 1,
  matrixHeight: 1,
  tileWidth: 256,
  tileHeight: 256,
  pixelXSize: 156543.03392804097,
  pixelYSize: 156543.03392804097,
});

// Insert tile with format validation
const tileData = await Deno.readFile("tile_0_0_0.png");
await gpkg.insertTile(
  "world_tiles",
  { zoomLevel: 0, tileColumn: 0, tileRow: 0, tileData },
  { validateFormat: true, allowedFormats: ["png", "jpeg", "webp"] },
);

// Detect tile format
const format = await gpkg.detectTileFormat(tileData); // "png"

// Retrieve tile
const tile = await gpkg.getTile("world_tiles", { zoom: 0, column: 0, row: 0 });

await gpkg.close();
```

### Transactions

```typescript
import { GeoPackage } from "jsr:@nullstyle/gpkg";

const gpkg = await GeoPackage.open("data.gpkg");

await gpkg.createFeatureTable({
  tableName: "points",
  geometryType: "POINT",
  srsId: 4326,
});

// Use transactions for atomic operations (callback must be sync)
await gpkg.transaction(() => {
  // Transaction callbacks are synchronous
  // For batch inserts, prefer insertFeatures() instead
});

// Or use batch insert with progress
await gpkg.insertFeatures(
  "points",
  Array.from({ length: 1000 }, (_, i) => ({
    geometry: {
      type: "Point" as const,
      coordinates: [Math.random() * 360 - 180, Math.random() * 180 - 90],
    },
    properties: { index: i },
  })),
  { yieldEvery: 100 },
);

console.log(`Inserted ${await gpkg.countFeatures("points")} features`);

await gpkg.close();
```

## API Reference

### GeoPackage Class

#### Static Methods

- `GeoPackage.open(path: string, options?: GeoPackageOptions): Promise<GeoPackage>`
- `GeoPackage.memory(): Promise<GeoPackage>`

#### Properties

- `path: string` - Database file path
- `closed: boolean` - Whether the database is closed

#### Spatial Reference Systems

- `getSpatialReferenceSystem(srsId: number): Promise<SpatialReferenceSystem | undefined>`
- `listSpatialReferenceSystems(): Promise<SpatialReferenceSystem[]>`
- `addSpatialReferenceSystem(srs: SpatialReferenceSystem): Promise<void>`
- `hasSpatialReferenceSystem(srsId: number): Promise<boolean>`

#### Contents

- `getContent(tableName: string): Promise<Content | undefined>`
- `listContents(): Promise<Content[]>`
- `listContentsByType(dataType: "features" | "tiles" | "attributes"): Promise<Content[]>`

#### Features

- `createFeatureTable(config: FeatureTableConfig): Promise<void>`
- `insertFeature<T>(tableName: string, feature: Omit<Feature<T>, "id">): Promise<number>`
- `insertFeatures<T>(tableName: string, features: Omit<Feature<T>, "id">[], options?: BatchOptions): Promise<number[]>`
- `getFeature<T>(tableName: string, id: number): Promise<Feature<T> | undefined>`
- `queryFeatures<T>(tableName: string, options?: FeatureQueryOptions): Promise<Feature<T>[]>`
- `iterateFeatures<T>(tableName: string, options?: { yieldEvery?: number }): AsyncGenerator<Feature<T>>`
- `updateFeature<T>(tableName: string, id: number, updates: Partial<Omit<Feature<T>, "id">>): Promise<void>`
- `deleteFeature(tableName: string, id: number): Promise<void>`
- `countFeatures(tableName: string, options?: { where?: WhereClause; bounds?: BoundingBox }): Promise<number>`
- `calculateFeatureBounds(tableName: string): Promise<BoundingBox | undefined>`

#### Spatial Index

- `hasSpatialIndex(tableName: string): Promise<boolean>`
- `createSpatialIndex(tableName: string): Promise<void>`
- `dropSpatialIndex(tableName: string): Promise<void>`
- `rebuildSpatialIndex(tableName: string): Promise<void>`

#### Attribute Tables

- `createAttributeTable(config: AttributeTableConfig): Promise<void>`
- `insertAttribute<T>(tableName: string, row: Omit<AttributeRow<T>, "id">): Promise<number>`
- `insertAttributes<T>(tableName: string, rows: Omit<AttributeRow<T>, "id">[], options?: BatchOptions): Promise<number[]>`
- `getAttribute<T>(tableName: string, id: number): Promise<AttributeRow<T> | undefined>`
- `queryAttributes<T>(tableName: string, options?: AttributeQueryOptions): Promise<AttributeRow<T>[]>`
- `updateAttribute<T>(tableName: string, id: number, updates: Partial<T>): Promise<void>`
- `deleteAttribute(tableName: string, id: number): Promise<void>`
- `countAttributes(tableName: string, options?: { where?: WhereClause }): Promise<number>`

#### GeoJSON

- `toGeoJSON(tableName: string, options?: ToGeoJSONOptions): Promise<GeoJSONFeatureCollection>`
- `fromGeoJSON(geojson: GeoJSONFeatureCollection, options: FromGeoJSONOptions): Promise<{ tableName: string; insertedCount: number }>`

#### Schema Extension

- `addDataColumn(column: DataColumn): Promise<void>`
- `getDataColumn(tableName: string, columnName: string): Promise<DataColumn | undefined>`
- `listDataColumns(tableName: string): Promise<DataColumn[]>`
- `addRangeConstraint(constraint: RangeConstraint): Promise<void>`
- `addEnumConstraint(constraint: EnumConstraint): Promise<void>`
- `addGlobConstraint(constraint: GlobConstraint): Promise<void>`
- `getConstraints(constraintName: string): Promise<DataColumnConstraint[]>`
- `validateValueAgainstConstraint(constraintName: string, value: unknown): Promise<boolean>`

#### Tiles

- `createTileMatrixSet(config: TileMatrixSet): Promise<void>`
- `addTileMatrix(matrix: TileMatrix): Promise<void>`
- `insertTile(tableName: string, tile: Omit<Tile, "id">, validationOptions?: TileValidationOptions): Promise<number>`
- `insertTiles(tableName: string, tiles: Omit<Tile, "id">[], options?: BatchOptions): Promise<number[]>`
- `getTile(tableName: string, coords: { zoom: number; column: number; row: number }): Promise<Tile | undefined>`
- `queryTiles(tableName: string, options?: TileQueryOptions): Promise<Tile[]>`
- `deleteTile(tableName: string, coords: { zoom: number; column: number; row: number }): Promise<void>`
- `detectTileFormat(data: Uint8Array): Promise<TileImageFormat>`
- `validateTileData(data: Uint8Array, options?: TileValidationOptions): Promise<TileImageFormat>`

#### Extensions

- `addExtension(extension: Extension): Promise<void>`
- `listExtensions(): Promise<Extension[]>`
- `hasExtension(extensionName: string, tableName?: string | null, columnName?: string | null): Promise<boolean>`

#### Transactions & Database

- `transaction<T>(fn: () => T): Promise<T>` - Execute sync function in
  transaction
- `close(): Promise<void>`

#### Batch Options

```typescript
interface BatchOptions {
  /** Yield to event loop every N operations (default: 100) */
  yieldEvery?: number;
  /** Progress callback */
  onProgress?: (completed: number, total: number) => void;
}
```

### Geometry Functions

- `encodeGeometry(geometry: Geometry | null, options?: { srsId?: number }): Uint8Array`
- `decodeGeometry(buffer: Uint8Array): Geometry & { srsId: number }`

## Supported Geometry Types

- Point
- LineString
- Polygon
- MultiPoint
- MultiLineString
- MultiPolygon
- GeometryCollection

All geometry types support Z (elevation) and M (measure) coordinates with
configurable enforcement:

- `z: 0` - Z coordinates prohibited
- `z: 1` - Z coordinates required
- `z: 2` - Z coordinates optional

## Default Spatial Reference Systems

The package includes these SRS by default:

- **EPSG:4326** - WGS 84 (geographic coordinates)
- **EPSG:3857** - Web Mercator (projected coordinates)
- **-1** - Undefined Cartesian SRS
- **0** - Undefined Geographic SRS

## Development

### Prerequisites

- [mise](https://mise.jdx.dev/) for environment management
- [just](https://just.systems/) for task automation

### Setup

```bash
# Install dependencies
just install

# Run tests
just test

# Format code
just fmt

# Lint code
just lint

# Type check
just check

# Run all checks
just verify
```

### Testing

```bash
# Run all tests
just test

# Run specific test file
just test-file tests/geometry_test.ts

# Run tests with coverage
just test-coverage
```

## Design Philosophy

This package follows a lightweight, focused approach:

- **Minimal Dependencies**: Only depends on `jsr:@db/sqlite`
- **Core Functionality**: Implements essential GeoPackage operations
- **Standards Compliant**: Follows OGC GeoPackage 1.3 specification
- **Type Safety**: Comprehensive TypeScript types throughout
- **Security**: Parameterized queries to prevent SQL injection

## What's Not Included

To keep the package lightweight, the following are **not** included:

- Rendering/visualization (use Leaflet, MapLibre, etc.)
- Coordinate transformations (use proj4js or similar)
- Tile generation (use sharp, canvas, or similar)
- Complex curve geometries (CircularString, CompoundCurve, etc.)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## References

- [OGC GeoPackage Specification](http://www.geopackage.org/spec/)
- [jsr:@db/sqlite](https://jsr.io/@db/sqlite)
- [GeoPackage Website](http://www.geopackage.org/)
