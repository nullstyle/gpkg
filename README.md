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
- **Feature Support**: Create and manage vector feature tables with geometries
- **Tile Support**: Create and manage raster tile pyramids
- **Geometry Encoding**: Full GeoPackage binary geometry format support
  (WKB-based)
- **Transaction Support**: ACID transactions for data integrity
- **Extension Management**: Register and manage GeoPackage extensions

## Installation

```bash
deno add jsr:@nullstyle/gpkg
```

Or use directly with JSR specifier:

```typescript
import { GeoPackage } from "jsr:@nullstyle/gpkg";
```

## Quick Start

### Create a GeoPackage and Add Features

```typescript
import { GeoPackage } from "jsr:@nullstyle/gpkg";

// Create or open a GeoPackage
const gpkg = new GeoPackage("mydata.gpkg");

// Create a feature table
gpkg.createFeatureTable({
  tableName: "cities",
  geometryType: "POINT",
  srsId: 4326, // WGS 84
  columns: [
    { name: "name", type: "TEXT", notNull: true },
    { name: "population", type: "INTEGER" },
    { name: "country", type: "TEXT" },
  ],
});

// Insert features
gpkg.insertFeature("cities", {
  geometry: { type: "Point", coordinates: [-122.4194, 37.7749] },
  properties: {
    name: "San Francisco",
    population: 873965,
    country: "USA",
  },
});

gpkg.insertFeature("cities", {
  geometry: { type: "Point", coordinates: [-0.1276, 51.5074] },
  properties: {
    name: "London",
    population: 8982000,
    country: "UK",
  },
});

// Query features
const largeCities = gpkg.queryFeatures("cities", {
  where: "population > 1000000",
  orderBy: "population DESC",
});

console.log(`Found ${largeCities.length} large cities`);

// Close the database
gpkg.close();
```

### Working with Tiles

```typescript
import { GeoPackage } from "jsr:@nullstyle/gpkg";

const gpkg = new GeoPackage("tiles.gpkg");

// Create tile matrix set
gpkg.createTileMatrixSet({
  tableName: "world_tiles",
  srsId: 3857, // Web Mercator
  minX: -20037508.34,
  minY: -20037508.34,
  maxX: 20037508.34,
  maxY: 20037508.34,
});

// Add tile matrix (zoom level)
gpkg.addTileMatrix({
  tableName: "world_tiles",
  zoomLevel: 0,
  matrixWidth: 1,
  matrixHeight: 1,
  tileWidth: 256,
  tileHeight: 256,
  pixelXSize: 156543.03392804097,
  pixelYSize: 156543.03392804097,
});

// Insert tile (PNG image data)
const tileData = await Deno.readFile("tile_0_0_0.png");
gpkg.insertTile("world_tiles", {
  zoomLevel: 0,
  tileColumn: 0,
  tileRow: 0,
  tileData,
});

// Retrieve tile
const tile = gpkg.getTile("world_tiles", {
  zoom: 0,
  column: 0,
  row: 0,
});

if (tile) {
  await Deno.writeFile("retrieved_tile.png", tile.tileData);
}

gpkg.close();
```

### Transactions

```typescript
import { GeoPackage } from "jsr:@nullstyle/gpkg";

const gpkg = new GeoPackage("data.gpkg");

gpkg.createFeatureTable({
  tableName: "points",
  geometryType: "POINT",
  srsId: 4326,
  columns: [{ name: "name", type: "TEXT" }],
});

// Use transactions for atomic operations
gpkg.transaction(() => {
  for (let i = 0; i < 1000; i++) {
    gpkg.insertFeature("points", {
      geometry: {
        type: "Point",
        coordinates: [Math.random() * 360 - 180, Math.random() * 180 - 90],
      },
      properties: { name: `Point ${i}` },
    });
  }
});

console.log(`Inserted ${gpkg.countFeatures("points")} features`);

gpkg.close();
```

## API Reference

### GeoPackage Class

#### Constructor

- `new GeoPackage(path: string, options?: GeoPackageOptions)`

#### Spatial Reference Systems

- `getSpatialReferenceSystem(srsId: number): SpatialReferenceSystem | undefined`
- `listSpatialReferenceSystems(): SpatialReferenceSystem[]`
- `addSpatialReferenceSystem(srs: SpatialReferenceSystem): void`
- `hasSpatialReferenceSystem(srsId: number): boolean`

#### Contents

- `getContent(tableName: string): Content | undefined`
- `listContents(): Content[]`
- `listContentsByType(dataType: "features" | "tiles" | "attributes"): Content[]`

#### Features

- `createFeatureTable(config: FeatureTableConfig): void`
- `insertFeature<T>(tableName: string, feature: Omit<Feature<T>, "id">): number`
- `getFeature<T>(tableName: string, id: number): Feature<T> | undefined`
- `queryFeatures<T>(tableName: string, options?: FeatureQueryOptions): Feature<T>[]`
- `updateFeature<T>(tableName: string, id: number, updates: Partial<Omit<Feature<T>, "id">>): void`
- `deleteFeature(tableName: string, id: number): void`
- `countFeatures(tableName: string, options?: Pick<FeatureQueryOptions, "where" | "bounds">): number`
- `calculateFeatureBounds(tableName: string): BoundingBox | undefined`

#### Tiles

- `createTileMatrixSet(config: TileMatrixSet): void`
- `addTileMatrix(matrix: TileMatrix): void`
- `insertTile(tableName: string, tile: Omit<Tile, "id">): number`
- `getTile(tableName: string, coords: { zoom: number; column: number; row: number }): Tile | undefined`
- `queryTiles(tableName: string, options?: TileQueryOptions): Tile[]`
- `deleteTile(tableName: string, coords: { zoom: number; column: number; row: number }): void`

#### Extensions

- `addExtension(extension: Extension): void`
- `listExtensions(): Extension[]`
- `hasExtension(extensionName: string, tableName?: string | null, columnName?: string | null): boolean`

#### Transactions

- `transaction<T>(fn: () => T): T`

#### Database

- `close(): void`

### Geometry Functions

- `encodeGeometry(geometry: Geometry | null, options?: { srsId?: number; envelope?: string }): Uint8Array`
- `decodeGeometry(buffer: Uint8Array): Geometry & { srsId: number }`

## Supported Geometry Types

- Point
- LineString
- Polygon
- MultiPoint
- MultiLineString
- MultiPolygon
- GeometryCollection

All geometry types support Z (elevation) and M (measure) coordinates.

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

This package follows a lightweight, focused approach inspired by
`@nullstyle/ustate`:

- **Minimal Dependencies**: Only depends on `jsr:@db/sqlite`
- **Core Functionality**: Focuses on essential GeoPackage operations
- **No Rendering**: Users handle visualization with their preferred libraries
- **No Projections**: Users add projection libraries as needed
- **Type Safety**: Comprehensive TypeScript types throughout

## What's Not Included

To keep the package lightweight, the following are **not** included:

- Rendering/visualization (use Leaflet, MapLibre, etc.)
- Coordinate transformations (use proj4js or similar)
- Spatial indexing (R-tree can be added as extension)
- GeoJSON conversion (trivial to implement in userland)
- Tile generation (use sharp, canvas, or similar)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## References

- [OGC GeoPackage Specification](http://www.geopackage.org/spec/)
- [jsr:@db/sqlite](https://jsr.io/@db/sqlite)
- [GeoPackage Website](http://www.geopackage.org/)
