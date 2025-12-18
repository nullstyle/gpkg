/**
 * A lightweight JSR package for interacting with GeoPackage files.
 *
 * This package provides a minimal, focused implementation of the OGC GeoPackage
 * specification, built on top of jsr:@db/sqlite. It follows a lightweight approach
 * focusing on core functionality without unnecessary dependencies.
 *
 * Features include:
 * - Async API with Promise-based operations
 * - Feature tables with geometry validation
 * - R-tree spatial indexing
 * - Attribute (non-spatial) tables
 * - GeoJSON import/export
 * - Tile pyramids with format validation
 * - Schema extension with constraints
 * - Batch operations with progress callbacks
 *
 * @module
 *
 * @example Basic Usage
 * ```ts
 * import { GeoPackage } from "jsr:@nullstyle/gpkg";
 *
 * // Open or create a GeoPackage
 * const gpkg = await GeoPackage.open("mydata.gpkg");
 *
 * await gpkg.createFeatureTable({
 *   tableName: "points",
 *   geometryType: "POINT",
 *   srsId: 4326,
 *   columns: [{ name: "name", type: "TEXT" }]
 * });
 *
 * await gpkg.insertFeature("points", {
 *   geometry: { type: "Point", coordinates: [-122.4, 37.8] },
 *   properties: { name: "San Francisco" }
 * });
 *
 * // Query with parameterized WHERE (SQL injection safe)
 * const features = await gpkg.queryFeatures("points", {
 *   where: { sql: "name = ?", params: ["San Francisco"] }
 * });
 *
 * await gpkg.close();
 * ```
 *
 * @example Batch Operations
 * ```ts
 * // Batch insert with progress tracking
 * const ids = await gpkg.insertFeatures("points", manyFeatures, {
 *   yieldEvery: 100,
 *   onProgress: (done, total) => console.log(`${done}/${total}`)
 * });
 *
 * // Async iteration
 * for await (const feature of gpkg.iterateFeatures("points")) {
 *   console.log(feature.id);
 * }
 * ```
 */

// Export main class and batch options
export { GeoPackage } from "./src/geopackage.ts";
export type { BatchOptions } from "./src/geopackage.ts";

// Export types
export type {
  AttributeTableConfig,
  BoundingBox,
  ColumnDefinition,
  Content,
  Extension,
  Feature,
  FeatureQueryOptions,
  FeatureTableConfig,
  Geometry,
  GeometryColumn,
  GeometryFlags,
  GeometryType,
  GeoPackageOptions,
  SpatialReferenceSystem,
  Tile,
  TileMatrix,
  TileMatrixSet,
  TileQueryOptions,
  WhereClause,
} from "./src/types.ts";

// Export tile format types
export type { TileImageFormat, TileValidationOptions } from "./src/tiles.ts";
export { detectTileFormat, validateTileData } from "./src/tiles.ts";

// Export attribute table types
export type { AttributeQueryOptions, AttributeRow } from "./src/attributes.ts";

// Export schema extension types
export type {
  ConstraintType,
  DataColumn,
  DataColumnConstraint,
  EnumConstraint,
  GlobConstraint,
  RangeConstraint,
} from "./src/schema.ts";

// Export GeoJSON types and helpers
export type {
  FromGeoJSONOptions,
  GeoJSONCRS,
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  GeoJSONGeometry,
  ToGeoJSONOptions,
} from "./src/geojson.ts";
export { featureFromGeoJSON, featureToGeoJSON } from "./src/geojson.ts";

// Export geometry encoding/decoding functions
export { decodeGeometry, encodeGeometry } from "./src/geometry.ts";

// Export common extension names
export { COMMON_EXTENSIONS } from "./src/extensions.ts";

// Export utility functions
export {
  boundsIntersect,
  expandBounds,
  getGeometryTypeName,
  getWkbTypeCode,
  isValidGeometryType,
  isValidSrsId,
  isValidZoomLevel,
  mergeBounds,
  normalizeGeometryType,
} from "./src/utils.ts";
