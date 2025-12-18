/**
 * Core types and interfaces for GeoPackage operations.
 * @module
 */

/**
 * Spatial Reference System definition.
 */
export interface SpatialReferenceSystem {
  /** Human-readable name of the SRS */
  srsName: string;
  /** Unique identifier for the SRS */
  srsId: number;
  /** Organization that defines the SRS (e.g., "EPSG") */
  organization: string;
  /** Organization's coordinate system ID */
  organizationCoordsysId: number;
  /** WKT definition of the SRS */
  definition: string;
  /** Human-readable description */
  description?: string;
}

/**
 * Bounding box coordinates.
 */
export interface BoundingBox {
  /** Minimum X coordinate */
  minX: number;
  /** Minimum Y coordinate */
  minY: number;
  /** Maximum X coordinate */
  maxX: number;
  /** Maximum Y coordinate */
  maxY: number;
}

/**
 * Content entry in gpkg_contents table.
 */
export interface Content {
  /** Name of the content table */
  tableName: string;
  /** Type of data: "features", "tiles", "attributes" */
  dataType: "features" | "tiles" | "attributes";
  /** Human-readable identifier */
  identifier?: string;
  /** Human-readable description */
  description?: string;
  /** Timestamp of last change (ISO 8601) */
  lastChange?: string;
  /** Bounding box of content */
  bounds?: BoundingBox;
  /** Spatial reference system ID */
  srsId?: number;
}

/**
 * Geometry types supported by GeoPackage.
 */
export type GeometryType =
  | "GEOMETRY"
  | "POINT"
  | "LINESTRING"
  | "POLYGON"
  | "MULTIPOINT"
  | "MULTILINESTRING"
  | "MULTIPOLYGON"
  | "GEOMETRYCOLLECTION"
  | "CIRCULARSTRING"
  | "COMPOUNDCURVE"
  | "CURVEPOLYGON"
  | "MULTICURVE"
  | "MULTISURFACE"
  | "CURVE"
  | "SURFACE";

/**
 * Column definition for creating tables.
 */
export interface ColumnDefinition {
  /** Column name */
  name: string;
  /** SQL type (e.g., "INTEGER", "TEXT", "REAL", "BLOB") */
  type: string;
  /** Whether column is NOT NULL */
  notNull?: boolean;
  /** Default value */
  defaultValue?: string | number | null;
  /** Whether column is primary key */
  primaryKey?: boolean;
  /** Whether column is autoincrement */
  autoincrement?: boolean;
  /** Whether column is unique */
  unique?: boolean;
}

/**
 * Geometry column metadata.
 */
export interface GeometryColumn {
  /** Feature table name */
  tableName: string;
  /** Geometry column name */
  columnName: string;
  /** Geometry type */
  geometryTypeName: GeometryType;
  /** Spatial reference system ID */
  srsId: number;
  /** Z coordinate: 0=prohibited, 1=mandatory, 2=optional */
  z: 0 | 1 | 2;
  /** M coordinate: 0=prohibited, 1=mandatory, 2=optional */
  m: 0 | 1 | 2;
}

/**
 * Feature table configuration.
 */
export interface FeatureTableConfig {
  /** Table name */
  tableName: string;
  /** Geometry column name (default: "geom") */
  geometryColumn?: string;
  /** Geometry type */
  geometryType: GeometryType;
  /** Spatial reference system ID */
  srsId: number;
  /** Additional columns */
  columns?: ColumnDefinition[];
  /** Z coordinate support */
  z?: 0 | 1 | 2;
  /** M coordinate support */
  m?: 0 | 1 | 2;
}

/**
 * Attribute table configuration (non-spatial table).
 */
export interface AttributeTableConfig {
  /** Table name */
  tableName: string;
  /** Additional columns */
  columns?: ColumnDefinition[];
  /** Human-readable identifier */
  identifier?: string;
  /** Human-readable description */
  description?: string;
}

/**
 * Tile matrix set definition.
 */
export interface TileMatrixSet {
  /** Tile pyramid table name */
  tableName: string;
  /** Spatial reference system ID */
  srsId: number;
  /** Minimum X of bounding box */
  minX: number;
  /** Minimum Y of bounding box */
  minY: number;
  /** Maximum X of bounding box */
  maxX: number;
  /** Maximum Y of bounding box */
  maxY: number;
}

/**
 * Tile matrix (zoom level) definition.
 */
export interface TileMatrix {
  /** Tile pyramid table name */
  tableName: string;
  /** Zoom level (0 = minimum) */
  zoomLevel: number;
  /** Number of columns */
  matrixWidth: number;
  /** Number of rows */
  matrixHeight: number;
  /** Tile width in pixels */
  tileWidth: number;
  /** Tile height in pixels */
  tileHeight: number;
  /** Pixel width in SRS units */
  pixelXSize: number;
  /** Pixel height in SRS units */
  pixelYSize: number;
}

/**
 * Tile data.
 */
export interface Tile {
  /** Tile ID */
  id?: number;
  /** Zoom level */
  zoomLevel: number;
  /** Column index */
  tileColumn: number;
  /** Row index */
  tileRow: number;
  /** Tile image data (PNG, JPEG, WebP) */
  tileData: Uint8Array;
}

/**
 * Extension definition.
 */
export interface Extension {
  /** Table using extension (null for database-wide) */
  tableName?: string | null;
  /** Column using extension (null for table-wide) */
  columnName?: string | null;
  /** Extension name */
  extensionName: string;
  /** Extension definition/specification */
  definition: string;
  /** Extension scope: "read-write" or "write-only" */
  scope: "read-write" | "write-only";
}

/**
 * Simple geometry representation (GeoJSON-like).
 */
export interface Geometry {
  /** Geometry type */
  type: string;
  /** Coordinates array */
  coordinates: number[] | number[][] | number[][][] | number[][][][];
  /** Optional geometries for GeometryCollection */
  geometries?: Geometry[];
}

/**
 * GeoPackage binary geometry header flags.
 */
export interface GeometryFlags {
  /** Binary type: 0=standard, 1=extended */
  binaryType: 0 | 1;
  /** Empty geometry flag */
  empty: boolean;
  /** Envelope type: 0=none, 1=XY, 2=XYZ, 3=XYM, 4=XYZM */
  envelopeType: 0 | 1 | 2 | 3 | 4;
  /** Byte order: 0=big-endian, 1=little-endian */
  byteOrder: 0 | 1;
}

/**
 * Feature with geometry and properties.
 */
export interface Feature<T = Record<string, unknown>> {
  /** Feature ID */
  id?: number;
  /** Geometry */
  geometry: Geometry | null;
  /** Feature properties */
  properties: T;
}

/**
 * Parameterized WHERE clause for safe SQL queries.
 */
export interface WhereClause {
  /** SQL fragment with ? placeholders */
  sql: string;
  /** Parameter values to bind to placeholders */
  params: unknown[];
}

/**
 * Query options for features.
 */
export interface FeatureQueryOptions {
  /** WHERE clause with parameterized SQL */
  where?: WhereClause;
  /** Bounding box filter */
  bounds?: BoundingBox;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** ORDER BY clause */
  orderBy?: string;
}

/**
 * Query options for tiles.
 */
export interface TileQueryOptions {
  /** Zoom level */
  zoom?: number;
  /** Minimum column */
  minColumn?: number;
  /** Maximum column */
  maxColumn?: number;
  /** Minimum row */
  minRow?: number;
  /** Maximum row */
  maxRow?: number;
}

/**
 * Database open options.
 */
export interface GeoPackageOptions {
  /** Create database if it doesn't exist */
  create?: boolean;
  /** Open in read-only mode */
  readonly?: boolean;
  /** Use in-memory database */
  memory?: boolean;
}
