/**
 * GeoJSON import/export helpers for GeoPackage.
 * @module
 */

import type { Database } from "@db/sqlite";
import type {
  BoundingBox,
  Feature,
  FeatureTableConfig,
  Geometry,
  GeometryType,
} from "./types.ts";
import {
  createFeatureTable,
  getGeometryColumn,
  insertFeature,
  queryFeatures,
} from "./features.ts";
import { getSpatialReferenceSystem } from "./srs.ts";
import { getContent } from "./contents.ts";

/**
 * GeoJSON Feature object.
 */
export interface GeoJSONFeature {
  type: "Feature";
  id?: string | number;
  geometry: GeoJSONGeometry | null;
  properties: Record<string, unknown>;
}

/**
 * GeoJSON Geometry object.
 */
export interface GeoJSONGeometry {
  type: string;
  coordinates: number[] | number[][] | number[][][] | number[][][][];
  geometries?: GeoJSONGeometry[];
}

/**
 * GeoJSON FeatureCollection object.
 */
export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
  crs?: GeoJSONCRS;
  bbox?: number[];
}

/**
 * GeoJSON Coordinate Reference System.
 */
export interface GeoJSONCRS {
  type: "name" | "link";
  properties: {
    name?: string;
    href?: string;
    type?: string;
  };
}

/**
 * Options for exporting to GeoJSON.
 */
export interface ToGeoJSONOptions {
  /** Include CRS information in output */
  includeCRS?: boolean;
  /** Include bounding box in output */
  includeBBox?: boolean;
  /** Custom property mapping function */
  propertyMapper?: (
    properties: Record<string, unknown>,
  ) => Record<string, unknown>;
}

/**
 * Options for importing from GeoJSON.
 */
export interface FromGeoJSONOptions {
  /** Table name to create/use */
  tableName: string;
  /** SRS ID to use (default: 4326) */
  srsId?: number;
  /** Geometry column name (default: "geom") */
  geometryColumn?: string;
  /** Additional column definitions (auto-detected if not provided) */
  columns?: { name: string; type: string }[];
  /** Whether to append to existing table (default: false, creates new table) */
  append?: boolean;
  /** Custom property mapping function */
  propertyMapper?: (
    properties: Record<string, unknown>,
  ) => Record<string, unknown>;
}

/**
 * Export features from a table to GeoJSON FeatureCollection.
 */
export function toGeoJSON(
  db: Database,
  tableName: string,
  options: ToGeoJSONOptions = {},
): GeoJSONFeatureCollection {
  const geomCol = getGeometryColumn(db, tableName);
  if (!geomCol) {
    throw new Error(`Table ${tableName} is not a feature table`);
  }

  const features = queryFeatures(db, tableName);
  const geojsonFeatures: GeoJSONFeature[] = features.map((feature) => {
    let properties = feature.properties as Record<string, unknown>;
    if (options.propertyMapper) {
      properties = options.propertyMapper(properties);
    }

    return {
      type: "Feature" as const,
      id: feature.id,
      geometry: feature.geometry ? toGeoJSONGeometry(feature.geometry) : null,
      properties,
    };
  });

  const result: GeoJSONFeatureCollection = {
    type: "FeatureCollection",
    features: geojsonFeatures,
  };

  // Add CRS if requested
  if (options.includeCRS) {
    const srs = getSpatialReferenceSystem(db, geomCol.srsId);
    if (srs) {
      result.crs = srsToGeoJSONCRS(srs.srsId, srs.organization);
    }
  }

  // Add bounding box if requested
  if (options.includeBBox) {
    const content = getContent(db, tableName);
    if (content?.bounds) {
      result.bbox = boundsToBBox(content.bounds);
    } else {
      // Calculate from features
      const bbox = calculateBBoxFromFeatures(geojsonFeatures);
      if (bbox) {
        result.bbox = bbox;
      }
    }
  }

  return result;
}

/**
 * Import features from GeoJSON FeatureCollection into a table.
 * Creates a new table or appends to existing one.
 */
export function fromGeoJSON(
  db: Database,
  geojson: GeoJSONFeatureCollection,
  options: FromGeoJSONOptions,
): { tableName: string; insertedCount: number } {
  if (geojson.type !== "FeatureCollection") {
    throw new Error("Input must be a GeoJSON FeatureCollection");
  }

  if (!geojson.features || geojson.features.length === 0) {
    throw new Error("FeatureCollection must contain at least one feature");
  }

  const tableName = options.tableName;
  const srsId = options.srsId ?? detectSrsFromGeoJSON(geojson) ?? 4326;
  const geometryColumn = options.geometryColumn ?? "geom";

  // Detect geometry type and columns from features
  const geometryType = detectGeometryType(geojson.features);
  const columns = options.columns ?? detectColumns(geojson.features);

  // Create table if not appending
  if (!options.append) {
    const config: FeatureTableConfig = {
      tableName,
      geometryType,
      srsId,
      geometryColumn,
      columns: columns.map((col) => ({
        name: col.name,
        type: col.type,
      })),
      z: detectHasZ(geojson.features) ? 2 : 0, // Optional Z if any feature has Z
      m: detectHasM(geojson.features) ? 2 : 0, // Optional M if any feature has M
    };

    createFeatureTable(db, config);
  }

  // Insert features
  let insertedCount = 0;
  for (const feature of geojson.features) {
    if (feature.type !== "Feature") {
      continue;
    }

    let properties = feature.properties ?? {};
    if (options.propertyMapper) {
      properties = options.propertyMapper(properties);
    }

    // Filter properties to only include defined columns
    const columnNames = new Set(columns.map((c) => c.name));
    const filteredProperties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (columnNames.has(key)) {
        filteredProperties[key] = value;
      }
    }

    const gpkgFeature: Omit<Feature, "id"> = {
      geometry: feature.geometry ? fromGeoJSONGeometry(feature.geometry) : null,
      properties: filteredProperties,
    };

    insertFeature(db, tableName, gpkgFeature);
    insertedCount++;
  }

  return { tableName, insertedCount };
}

/**
 * Convert a single GeoJSON feature to GeoPackage feature format.
 */
export function featureFromGeoJSON(
  feature: GeoJSONFeature,
): Omit<Feature, "id"> {
  return {
    geometry: feature.geometry ? fromGeoJSONGeometry(feature.geometry) : null,
    properties: feature.properties ?? {},
  };
}

/**
 * Convert a GeoPackage feature to GeoJSON feature format.
 */
export function featureToGeoJSON(feature: Feature): GeoJSONFeature {
  return {
    type: "Feature",
    id: feature.id,
    geometry: feature.geometry ? toGeoJSONGeometry(feature.geometry) : null,
    properties: feature.properties as Record<string, unknown>,
  };
}

/**
 * Convert internal Geometry to GeoJSON Geometry.
 */
function toGeoJSONGeometry(geometry: Geometry): GeoJSONGeometry {
  if (geometry.type === "GeometryCollection" && geometry.geometries) {
    return {
      type: geometry.type,
      coordinates: [],
      geometries: geometry.geometries.map(toGeoJSONGeometry),
    };
  }

  return {
    type: geometry.type,
    coordinates: geometry.coordinates,
  };
}

/**
 * Convert GeoJSON Geometry to internal Geometry.
 */
function fromGeoJSONGeometry(geojson: GeoJSONGeometry): Geometry {
  if (geojson.type === "GeometryCollection" && geojson.geometries) {
    return {
      type: geojson.type,
      coordinates: [],
      geometries: geojson.geometries.map(fromGeoJSONGeometry),
    };
  }

  return {
    type: geojson.type,
    coordinates: geojson.coordinates,
  };
}

/**
 * Convert SRS ID to GeoJSON CRS object.
 */
function srsToGeoJSONCRS(srsId: number, organization: string): GeoJSONCRS {
  // Use the urn:ogc:def:crs format which is more widely supported
  const urn = organization.toLowerCase() === "epsg"
    ? `urn:ogc:def:crs:EPSG::${srsId}`
    : `urn:ogc:def:crs:${organization}::${srsId}`;

  return {
    type: "name",
    properties: {
      name: urn,
    },
  };
}

/**
 * Convert BoundingBox to GeoJSON bbox array.
 */
function boundsToBBox(bounds: BoundingBox): number[] {
  return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
}

/**
 * Calculate bounding box from GeoJSON features.
 */
function calculateBBoxFromFeatures(
  features: GeoJSONFeature[],
): number[] | undefined {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  let hasCoords = false;

  for (const feature of features) {
    if (feature.geometry) {
      const coords = extractAllCoordinates(feature.geometry);
      for (const coord of coords) {
        hasCoords = true;
        minX = Math.min(minX, coord[0]);
        minY = Math.min(minY, coord[1]);
        maxX = Math.max(maxX, coord[0]);
        maxY = Math.max(maxY, coord[1]);
      }
    }
  }

  if (!hasCoords) {
    return undefined;
  }

  return [minX, minY, maxX, maxY];
}

/**
 * Extract all coordinates from a GeoJSON geometry.
 */
function extractAllCoordinates(geometry: GeoJSONGeometry): number[][] {
  const coords: number[][] = [];

  function extract(geom: GeoJSONGeometry) {
    if (geom.type === "Point") {
      coords.push(geom.coordinates as number[]);
    } else if (geom.type === "LineString" || geom.type === "MultiPoint") {
      for (const coord of geom.coordinates as number[][]) {
        coords.push(coord);
      }
    } else if (geom.type === "Polygon" || geom.type === "MultiLineString") {
      for (const ring of geom.coordinates as number[][][]) {
        for (const coord of ring) {
          coords.push(coord);
        }
      }
    } else if (geom.type === "MultiPolygon") {
      for (const polygon of geom.coordinates as number[][][][]) {
        for (const ring of polygon) {
          for (const coord of ring) {
            coords.push(coord);
          }
        }
      }
    } else if (geom.type === "GeometryCollection" && geom.geometries) {
      for (const g of geom.geometries) {
        extract(g);
      }
    }
  }

  extract(geometry);
  return coords;
}

/**
 * Detect the geometry type from GeoJSON features.
 */
function detectGeometryType(features: GeoJSONFeature[]): GeometryType {
  const types = new Set<string>();

  for (const feature of features) {
    if (feature.geometry) {
      types.add(feature.geometry.type.toUpperCase());
    }
  }

  // If all features have the same type, use that type
  if (types.size === 1) {
    const type = [...types][0];
    return normalizeToGeometryType(type);
  }

  // If mixed types, use GEOMETRY
  return "GEOMETRY";
}

/**
 * Normalize a geometry type string to GeometryType.
 */
function normalizeToGeometryType(type: string): GeometryType {
  const normalized = type.toUpperCase();
  const validTypes: GeometryType[] = [
    "GEOMETRY",
    "POINT",
    "LINESTRING",
    "POLYGON",
    "MULTIPOINT",
    "MULTILINESTRING",
    "MULTIPOLYGON",
    "GEOMETRYCOLLECTION",
  ];

  if (validTypes.includes(normalized as GeometryType)) {
    return normalized as GeometryType;
  }

  return "GEOMETRY";
}

/**
 * Detect columns from GeoJSON feature properties.
 */
function detectColumns(
  features: GeoJSONFeature[],
): { name: string; type: string }[] {
  const columnTypes = new Map<string, Set<string>>();

  for (const feature of features) {
    if (feature.properties) {
      for (const [key, value] of Object.entries(feature.properties)) {
        if (!columnTypes.has(key)) {
          columnTypes.set(key, new Set());
        }

        const sqlType = inferSQLType(value);
        columnTypes.get(key)!.add(sqlType);
      }
    }
  }

  const columns: { name: string; type: string }[] = [];

  for (const [name, types] of columnTypes) {
    // If multiple types detected, use TEXT as fallback
    let type = "TEXT";
    if (types.size === 1) {
      type = [...types][0];
    } else if (types.has("REAL") && types.has("INTEGER")) {
      // If both numeric types, use REAL
      type = "REAL";
    }

    columns.push({ name, type });
  }

  return columns;
}

/**
 * Infer SQL type from a JavaScript value.
 */
function inferSQLType(value: unknown): string {
  if (value === null || value === undefined) {
    return "TEXT";
  }

  const type = typeof value;

  switch (type) {
    case "number":
      return Number.isInteger(value) ? "INTEGER" : "REAL";
    case "boolean":
      return "INTEGER"; // SQLite stores booleans as integers
    case "string":
      return "TEXT";
    case "object":
      if (value instanceof Uint8Array) {
        return "BLOB";
      }
      return "TEXT"; // JSON objects stored as TEXT
    default:
      return "TEXT";
  }
}

/**
 * Detect SRS ID from GeoJSON CRS property.
 */
function detectSrsFromGeoJSON(
  geojson: GeoJSONFeatureCollection,
): number | undefined {
  if (!geojson.crs) {
    return undefined;
  }

  if (geojson.crs.type === "name" && geojson.crs.properties.name) {
    const name = geojson.crs.properties.name;

    // Parse urn:ogc:def:crs:EPSG::4326 format
    const urnMatch = name.match(/urn:ogc:def:crs:EPSG::(\d+)/i);
    if (urnMatch) {
      return parseInt(urnMatch[1], 10);
    }

    // Parse EPSG:4326 format
    const epsgMatch = name.match(/EPSG:(\d+)/i);
    if (epsgMatch) {
      return parseInt(epsgMatch[1], 10);
    }
  }

  return undefined;
}

/**
 * Check if any feature has Z coordinates.
 */
function detectHasZ(features: GeoJSONFeature[]): boolean {
  for (const feature of features) {
    if (feature.geometry) {
      const coords = extractAllCoordinates(feature.geometry);
      for (const coord of coords) {
        if (coord.length >= 3) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Check if any feature has M coordinates.
 */
function detectHasM(features: GeoJSONFeature[]): boolean {
  for (const feature of features) {
    if (feature.geometry) {
      const coords = extractAllCoordinates(feature.geometry);
      for (const coord of coords) {
        if (coord.length >= 4) {
          return true;
        }
      }
    }
  }
  return false;
}
