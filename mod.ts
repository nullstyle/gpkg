/**
 * A lightweight JSR package for interacting with GeoPackage files.
 *
 * This package provides a minimal, focused implementation of the OGC GeoPackage
 * specification, built on top of jsr:@db/sqlite. It follows a lightweight approach
 * similar to @nullstyle/ustate, focusing on core functionality without unnecessary
 * dependencies.
 *
 * @module
 *
 * @example
 * ```ts
 * import { GeoPackage } from "jsr:@nullstyle/gpkg";
 *
 * // Create or open a GeoPackage
 * const gpkg = new GeoPackage("mydata.gpkg");
 *
 * // Create a feature table
 * gpkg.createFeatureTable({
 *   tableName: "points",
 *   geometryType: "POINT",
 *   srsId: 4326,
 *   columns: [
 *     { name: "name", type: "TEXT" },
 *     { name: "value", type: "REAL" }
 *   ]
 * });
 *
 * // Insert a feature
 * gpkg.insertFeature("points", {
 *   geometry: { type: "Point", coordinates: [-122.4, 37.8] },
 *   properties: { name: "San Francisco", value: 42.5 }
 * });
 *
 * // Query features with parameterized WHERE clause
 * const features = gpkg.queryFeatures("points", {
 *   where: { sql: "value > ?", params: [40] }
 * });
 *
 * // Close the database
 * gpkg.close();
 * ```
 */

// Export main class
export { GeoPackage } from "./src/geopackage.ts";

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

// Export attribute table types
export type { AttributeQueryOptions, AttributeRow } from "./src/attributes.ts";

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
