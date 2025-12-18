/**
 * Main GeoPackage class for managing GeoPackage databases.
 * @module
 */

import { Database } from "@db/sqlite";
import type {
  AttributeTableConfig,
  BoundingBox,
  Content,
  Extension,
  Feature,
  FeatureQueryOptions,
  FeatureTableConfig,
  GeometryColumn,
  GeoPackageOptions,
  SpatialReferenceSystem,
  Tile,
  TileMatrix,
  TileMatrixSet,
  TileQueryOptions,
} from "./types.ts";

// Import all module functions
import * as srs from "./srs.ts";
import * as contents from "./contents.ts";
import * as features from "./features.ts";
import * as tiles from "./tiles.ts";
import * as extensions from "./extensions.ts";
import * as attributes from "./attributes.ts";
import * as geojson from "./geojson.ts";
import * as rtree from "./rtree.ts";
import * as schema from "./schema.ts";

/**
 * Yield to the event loop to prevent blocking.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Options for batch operations.
 */
export interface BatchOptions {
  /** Yield to event loop every N operations (default: 100) */
  yieldEvery?: number;
  /** Progress callback */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Async GeoPackage database manager.
 *
 * @example
 * ```ts
 * const gpkg = await GeoPackage.open("mydata.gpkg");
 *
 * await gpkg.createFeatureTable({
 *   tableName: "points",
 *   geometryType: "POINT",
 *   srsId: 4326,
 * });
 *
 * const id = await gpkg.insertFeature("points", {
 *   geometry: { type: "Point", coordinates: [0, 0] },
 *   properties: {},
 * });
 *
 * await gpkg.close();
 * ```
 */
export class GeoPackage {
  private db: Database;
  private _path: string;
  private _closed = false;

  /**
   * Private constructor. Use static `open()` or `memory()` methods.
   */
  private constructor(db: Database, path: string) {
    this.db = db;
    this._path = path;
  }

  /**
   * Open or create a GeoPackage database.
   *
   * @param path - Path to the GeoPackage file
   * @param options - Database options
   */
  static async open(
    path: string,
    options: GeoPackageOptions = {},
  ): Promise<GeoPackage> {
    await yieldToEventLoop();

    const db = new Database(path, {
      create: options.create ?? true,
      readonly: options.readonly ?? false,
      memory: options.memory ?? false,
    });

    const gpkg = new GeoPackage(db, path);

    // Initialize GeoPackage tables if creating new database
    if (!options.readonly) {
      gpkg.initializeTables();
    }

    return gpkg;
  }

  /**
   * Create an in-memory GeoPackage database.
   */
  static async memory(): Promise<GeoPackage> {
    await yieldToEventLoop();

    const db = new Database(":memory:", {
      create: true,
      readonly: false,
      memory: true,
    });

    const gpkg = new GeoPackage(db, ":memory:");
    gpkg.initializeTables();

    return gpkg;
  }

  /**
   * Get the database path.
   */
  get path(): string {
    return this._path;
  }

  /**
   * Check if the database is closed.
   */
  get closed(): boolean {
    return this._closed;
  }

  /**
   * Initialize GeoPackage required tables.
   */
  private initializeTables(): void {
    srs.initializeSrsTable(this.db);
    contents.initializeContentsTable(this.db);
    features.initializeGeometryColumnsTable(this.db);
    tiles.initializeTileMatrixTables(this.db);
    extensions.initializeExtensionsTable(this.db);
    schema.initializeSchemaExtensionTables(this.db);
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    await yieldToEventLoop();
    if (!this._closed) {
      this.db.close();
      this._closed = true;
    }
  }

  /**
   * Execute a transaction.
   * Note: The callback must be synchronous as SQLite transactions are synchronous.
   */
  async transaction<T>(fn: () => T): Promise<T> {
    await yieldToEventLoop();
    const txn = this.db.transaction(fn);
    return txn();
  }

  // ========== Spatial Reference Systems ==========

  /**
   * Get a spatial reference system by ID.
   */
  async getSpatialReferenceSystem(
    srsId: number,
  ): Promise<SpatialReferenceSystem | undefined> {
    await yieldToEventLoop();
    return srs.getSpatialReferenceSystem(this.db, srsId);
  }

  /**
   * List all spatial reference systems.
   */
  async listSpatialReferenceSystems(): Promise<SpatialReferenceSystem[]> {
    await yieldToEventLoop();
    return srs.listSpatialReferenceSystems(this.db);
  }

  /**
   * Add a spatial reference system.
   */
  async addSpatialReferenceSystem(
    system: SpatialReferenceSystem,
  ): Promise<void> {
    await yieldToEventLoop();
    srs.addSpatialReferenceSystem(this.db, system);
  }

  /**
   * Update a spatial reference system.
   */
  async updateSpatialReferenceSystem(
    system: SpatialReferenceSystem,
  ): Promise<void> {
    await yieldToEventLoop();
    srs.updateSpatialReferenceSystem(this.db, system);
  }

  /**
   * Delete a spatial reference system.
   */
  async deleteSpatialReferenceSystem(srsId: number): Promise<void> {
    await yieldToEventLoop();
    srs.deleteSpatialReferenceSystem(this.db, srsId);
  }

  /**
   * Check if a spatial reference system exists.
   */
  async hasSpatialReferenceSystem(srsId: number): Promise<boolean> {
    await yieldToEventLoop();
    return srs.hasSpatialReferenceSystem(this.db, srsId);
  }

  // ========== Contents ==========

  /**
   * Get content metadata by table name.
   */
  async getContent(tableName: string): Promise<Content | undefined> {
    await yieldToEventLoop();
    return contents.getContent(this.db, tableName);
  }

  /**
   * List all content entries.
   */
  async listContents(): Promise<Content[]> {
    await yieldToEventLoop();
    return contents.listContents(this.db);
  }

  /**
   * List content entries by data type.
   */
  async listContentsByType(
    dataType: "features" | "tiles" | "attributes",
  ): Promise<Content[]> {
    await yieldToEventLoop();
    return contents.listContentsByType(this.db, dataType);
  }

  /**
   * Add a content entry.
   */
  async addContent(content: Omit<Content, "lastChange">): Promise<void> {
    await yieldToEventLoop();
    contents.addContent(this.db, content);
  }

  /**
   * Update content metadata.
   */
  async updateContent(content: Content): Promise<void> {
    await yieldToEventLoop();
    contents.updateContent(this.db, content);
  }

  /**
   * Update content bounds.
   */
  async updateContentBounds(
    tableName: string,
    bounds: BoundingBox,
  ): Promise<void> {
    await yieldToEventLoop();
    contents.updateContentBounds(this.db, tableName, bounds);
  }

  /**
   * Delete a content entry.
   */
  async deleteContent(tableName: string): Promise<void> {
    await yieldToEventLoop();
    contents.deleteContent(this.db, tableName);
  }

  /**
   * Check if a content entry exists.
   */
  async hasContent(tableName: string): Promise<boolean> {
    await yieldToEventLoop();
    return contents.hasContent(this.db, tableName);
  }

  // ========== Features ==========

  /**
   * Create a feature table.
   */
  async createFeatureTable(config: FeatureTableConfig): Promise<void> {
    await yieldToEventLoop();
    features.createFeatureTable(this.db, config);
  }

  /**
   * Get geometry column metadata for a table.
   */
  async getGeometryColumn(
    tableName: string,
  ): Promise<GeometryColumn | undefined> {
    await yieldToEventLoop();
    return features.getGeometryColumn(this.db, tableName);
  }

  /**
   * List all geometry columns.
   */
  async listGeometryColumns(): Promise<GeometryColumn[]> {
    await yieldToEventLoop();
    return features.listGeometryColumns(this.db);
  }

  /**
   * Insert a feature.
   */
  async insertFeature<T = Record<string, unknown>>(
    tableName: string,
    feature: Omit<Feature<T>, "id">,
  ): Promise<number> {
    await yieldToEventLoop();
    return features.insertFeature(this.db, tableName, feature);
  }

  /**
   * Insert multiple features with periodic yielding.
   */
  async insertFeatures<T = Record<string, unknown>>(
    tableName: string,
    featureList: Omit<Feature<T>, "id">[],
    options: BatchOptions = {},
  ): Promise<number[]> {
    const yieldEvery = options.yieldEvery ?? 100;
    const ids: number[] = [];

    for (let i = 0; i < featureList.length; i++) {
      if (i > 0 && i % yieldEvery === 0) {
        await yieldToEventLoop();
        options.onProgress?.(i, featureList.length);
      }
      ids.push(features.insertFeature(this.db, tableName, featureList[i]));
    }

    options.onProgress?.(featureList.length, featureList.length);
    return ids;
  }

  /**
   * Get a feature by ID.
   */
  async getFeature<T = Record<string, unknown>>(
    tableName: string,
    id: number,
  ): Promise<Feature<T> | undefined> {
    await yieldToEventLoop();
    return features.getFeature(this.db, tableName, id);
  }

  /**
   * Query features.
   */
  async queryFeatures<T = Record<string, unknown>>(
    tableName: string,
    options?: FeatureQueryOptions,
  ): Promise<Feature<T>[]> {
    await yieldToEventLoop();
    return features.queryFeatures(this.db, tableName, options);
  }

  /**
   * Iterate over features asynchronously.
   */
  async *iterateFeatures<T = Record<string, unknown>>(
    tableName: string,
    options: { yieldEvery?: number } = {},
  ): AsyncGenerator<Feature<T>, void, unknown> {
    const yieldEvery = options.yieldEvery ?? 100;
    let count = 0;

    for (const feature of features.iterateFeatures<T>(this.db, tableName)) {
      yield feature;
      count++;
      if (count % yieldEvery === 0) {
        await yieldToEventLoop();
      }
    }
  }

  /**
   * Update a feature.
   */
  async updateFeature<T = Record<string, unknown>>(
    tableName: string,
    id: number,
    updates: Partial<Omit<Feature<T>, "id">>,
  ): Promise<void> {
    await yieldToEventLoop();
    features.updateFeature(this.db, tableName, id, updates);
  }

  /**
   * Delete a feature.
   */
  async deleteFeature(tableName: string, id: number): Promise<void> {
    await yieldToEventLoop();
    features.deleteFeature(this.db, tableName, id);
  }

  /**
   * Count features.
   */
  async countFeatures(
    tableName: string,
    options?: Pick<FeatureQueryOptions, "where" | "bounds">,
  ): Promise<number> {
    await yieldToEventLoop();
    return features.countFeatures(this.db, tableName, options);
  }

  /**
   * Calculate feature bounds.
   */
  async calculateFeatureBounds(
    tableName: string,
  ): Promise<BoundingBox | undefined> {
    await yieldToEventLoop();
    return features.calculateFeatureBounds(this.db, tableName);
  }

  // ========== Spatial Index ==========

  /**
   * Check if a spatial index exists.
   */
  async hasSpatialIndex(tableName: string): Promise<boolean> {
    await yieldToEventLoop();
    return rtree.hasSpatialIndex(this.db, tableName);
  }

  /**
   * Create a spatial index.
   */
  async createSpatialIndex(tableName: string): Promise<void> {
    await yieldToEventLoop();
    rtree.createSpatialIndex(this.db, tableName);
  }

  /**
   * Drop a spatial index.
   */
  async dropSpatialIndex(tableName: string): Promise<void> {
    await yieldToEventLoop();
    rtree.dropSpatialIndex(this.db, tableName);
  }

  /**
   * Rebuild a spatial index.
   */
  async rebuildSpatialIndex(tableName: string): Promise<void> {
    await yieldToEventLoop();
    rtree.populateSpatialIndex(this.db, tableName);
  }

  // ========== Schema Extension ==========

  /**
   * Add a data column definition.
   */
  async addDataColumn(column: schema.DataColumn): Promise<void> {
    await yieldToEventLoop();
    schema.addDataColumn(this.db, column);
  }

  /**
   * Get a data column definition.
   */
  async getDataColumn(
    tableName: string,
    columnName: string,
  ): Promise<schema.DataColumn | undefined> {
    await yieldToEventLoop();
    return schema.getDataColumn(this.db, tableName, columnName);
  }

  /**
   * List data column definitions for a table.
   */
  async listDataColumns(tableName: string): Promise<schema.DataColumn[]> {
    await yieldToEventLoop();
    return schema.listDataColumns(this.db, tableName);
  }

  /**
   * Update a data column definition.
   */
  async updateDataColumn(column: schema.DataColumn): Promise<void> {
    await yieldToEventLoop();
    schema.updateDataColumn(this.db, column);
  }

  /**
   * Delete a data column definition.
   */
  async deleteDataColumn(tableName: string, columnName: string): Promise<void> {
    await yieldToEventLoop();
    schema.deleteDataColumn(this.db, tableName, columnName);
  }

  /**
   * Add a range constraint.
   */
  async addRangeConstraint(constraint: schema.RangeConstraint): Promise<void> {
    await yieldToEventLoop();
    schema.addRangeConstraint(this.db, constraint);
  }

  /**
   * Add an enum constraint value.
   */
  async addEnumConstraint(constraint: schema.EnumConstraint): Promise<void> {
    await yieldToEventLoop();
    schema.addEnumConstraint(this.db, constraint);
  }

  /**
   * Add a glob constraint.
   */
  async addGlobConstraint(constraint: schema.GlobConstraint): Promise<void> {
    await yieldToEventLoop();
    schema.addGlobConstraint(this.db, constraint);
  }

  /**
   * Get constraints by name.
   */
  async getConstraints(
    constraintName: string,
  ): Promise<schema.DataColumnConstraint[]> {
    await yieldToEventLoop();
    return schema.getConstraints(this.db, constraintName);
  }

  /**
   * Get enum values for a constraint.
   */
  async getEnumValues(constraintName: string): Promise<string[]> {
    await yieldToEventLoop();
    return schema.getEnumValues(this.db, constraintName);
  }

  /**
   * Get a range constraint.
   */
  async getRangeConstraint(
    constraintName: string,
  ): Promise<schema.RangeConstraint | undefined> {
    await yieldToEventLoop();
    return schema.getRangeConstraint(this.db, constraintName);
  }

  /**
   * List all constraint names.
   */
  async listConstraintNames(): Promise<string[]> {
    await yieldToEventLoop();
    return schema.listConstraintNames(this.db);
  }

  /**
   * Delete a constraint.
   */
  async deleteConstraint(constraintName: string): Promise<void> {
    await yieldToEventLoop();
    schema.deleteConstraint(this.db, constraintName);
  }

  /**
   * Validate a value against a constraint.
   */
  async validateValueAgainstConstraint(
    constraintName: string,
    value: unknown,
  ): Promise<boolean> {
    await yieldToEventLoop();
    return schema.validateValueAgainstConstraint(
      this.db,
      constraintName,
      value,
    );
  }

  // ========== GeoJSON ==========

  /**
   * Export features to GeoJSON.
   */
  async toGeoJSON(
    tableName: string,
    options?: geojson.ToGeoJSONOptions,
  ): Promise<geojson.GeoJSONFeatureCollection> {
    await yieldToEventLoop();
    return geojson.toGeoJSON(this.db, tableName, options);
  }

  /**
   * Import features from GeoJSON.
   */
  async fromGeoJSON(
    geojsonData: geojson.GeoJSONFeatureCollection,
    options: geojson.FromGeoJSONOptions,
  ): Promise<{ tableName: string; insertedCount: number }> {
    await yieldToEventLoop();
    return geojson.fromGeoJSON(this.db, geojsonData, options);
  }

  // ========== Attribute Tables ==========

  /**
   * Create an attribute table.
   */
  async createAttributeTable(config: AttributeTableConfig): Promise<void> {
    await yieldToEventLoop();
    attributes.createAttributeTable(this.db, config);
  }

  /**
   * Insert an attribute row.
   */
  async insertAttribute<T = Record<string, unknown>>(
    tableName: string,
    row: Omit<attributes.AttributeRow<T>, "id">,
  ): Promise<number> {
    await yieldToEventLoop();
    return attributes.insertAttribute(this.db, tableName, row);
  }

  /**
   * Insert multiple attribute rows with periodic yielding.
   */
  async insertAttributes<T = Record<string, unknown>>(
    tableName: string,
    rows: Omit<attributes.AttributeRow<T>, "id">[],
    options: BatchOptions = {},
  ): Promise<number[]> {
    const yieldEvery = options.yieldEvery ?? 100;
    const ids: number[] = [];

    for (let i = 0; i < rows.length; i++) {
      if (i > 0 && i % yieldEvery === 0) {
        await yieldToEventLoop();
        options.onProgress?.(i, rows.length);
      }
      ids.push(attributes.insertAttribute(this.db, tableName, rows[i]));
    }

    options.onProgress?.(rows.length, rows.length);
    return ids;
  }

  /**
   * Get an attribute row by ID.
   */
  async getAttribute<T = Record<string, unknown>>(
    tableName: string,
    id: number,
  ): Promise<attributes.AttributeRow<T> | undefined> {
    await yieldToEventLoop();
    return attributes.getAttribute(this.db, tableName, id);
  }

  /**
   * Query attribute rows.
   */
  async queryAttributes<T = Record<string, unknown>>(
    tableName: string,
    options?: attributes.AttributeQueryOptions,
  ): Promise<attributes.AttributeRow<T>[]> {
    await yieldToEventLoop();
    return attributes.queryAttributes(this.db, tableName, options);
  }

  /**
   * Update an attribute row.
   */
  async updateAttribute<T = Record<string, unknown>>(
    tableName: string,
    id: number,
    updates: Partial<T>,
  ): Promise<void> {
    await yieldToEventLoop();
    attributes.updateAttribute(this.db, tableName, id, updates);
  }

  /**
   * Delete an attribute row.
   */
  async deleteAttribute(tableName: string, id: number): Promise<void> {
    await yieldToEventLoop();
    attributes.deleteAttribute(this.db, tableName, id);
  }

  /**
   * Count attribute rows.
   */
  async countAttributes(
    tableName: string,
    options?: Pick<attributes.AttributeQueryOptions, "where">,
  ): Promise<number> {
    await yieldToEventLoop();
    return attributes.countAttributes(this.db, tableName, options);
  }

  // ========== Tiles ==========

  /**
   * Create a tile matrix set.
   */
  async createTileMatrixSet(config: TileMatrixSet): Promise<void> {
    await yieldToEventLoop();
    tiles.createTileMatrixSet(this.db, config);
  }

  /**
   * Get a tile matrix set.
   */
  async getTileMatrixSet(
    tableName: string,
  ): Promise<TileMatrixSet | undefined> {
    await yieldToEventLoop();
    return tiles.getTileMatrixSet(this.db, tableName);
  }

  /**
   * List all tile matrix sets.
   */
  async listTileMatrixSets(): Promise<TileMatrixSet[]> {
    await yieldToEventLoop();
    return tiles.listTileMatrixSets(this.db);
  }

  /**
   * Add a tile matrix (zoom level).
   */
  async addTileMatrix(matrix: TileMatrix): Promise<void> {
    await yieldToEventLoop();
    tiles.addTileMatrix(this.db, matrix);
  }

  /**
   * Get a tile matrix.
   */
  async getTileMatrix(
    tableName: string,
    zoomLevel: number,
  ): Promise<TileMatrix | undefined> {
    await yieldToEventLoop();
    return tiles.getTileMatrix(this.db, tableName, zoomLevel);
  }

  /**
   * List tile matrices for a table.
   */
  async listTileMatrices(tableName: string): Promise<TileMatrix[]> {
    await yieldToEventLoop();
    return tiles.listTileMatrices(this.db, tableName);
  }

  /**
   * Insert a tile.
   */
  async insertTile(
    tableName: string,
    tile: Omit<Tile, "id">,
    validationOptions?: tiles.TileValidationOptions,
  ): Promise<number> {
    await yieldToEventLoop();
    return tiles.insertTile(this.db, tableName, tile, validationOptions);
  }

  /**
   * Insert multiple tiles with periodic yielding.
   */
  async insertTiles(
    tableName: string,
    tileList: Omit<Tile, "id">[],
    options: BatchOptions & {
      validationOptions?: tiles.TileValidationOptions;
    } = {},
  ): Promise<number[]> {
    const yieldEvery = options.yieldEvery ?? 50;
    const ids: number[] = [];

    for (let i = 0; i < tileList.length; i++) {
      if (i > 0 && i % yieldEvery === 0) {
        await yieldToEventLoop();
        options.onProgress?.(i, tileList.length);
      }
      ids.push(
        tiles.insertTile(
          this.db,
          tableName,
          tileList[i],
          options.validationOptions,
        ),
      );
    }

    options.onProgress?.(tileList.length, tileList.length);
    return ids;
  }

  /**
   * Detect tile image format.
   */
  async detectTileFormat(data: Uint8Array): Promise<tiles.TileImageFormat> {
    await yieldToEventLoop();
    return tiles.detectTileFormat(data);
  }

  /**
   * Validate tile data.
   */
  async validateTileData(
    data: Uint8Array,
    options?: tiles.TileValidationOptions,
  ): Promise<tiles.TileImageFormat> {
    await yieldToEventLoop();
    return tiles.validateTileData(data, options);
  }

  /**
   * Get a tile.
   */
  async getTile(
    tableName: string,
    coords: { zoom: number; column: number; row: number },
  ): Promise<Tile | undefined> {
    await yieldToEventLoop();
    return tiles.getTile(this.db, tableName, coords);
  }

  /**
   * Query tiles.
   */
  async queryTiles(
    tableName: string,
    options?: TileQueryOptions,
  ): Promise<Tile[]> {
    await yieldToEventLoop();
    return tiles.queryTiles(this.db, tableName, options);
  }

  /**
   * Delete a tile.
   */
  async deleteTile(
    tableName: string,
    coords: { zoom: number; column: number; row: number },
  ): Promise<void> {
    await yieldToEventLoop();
    tiles.deleteTile(this.db, tableName, coords);
  }

  /**
   * Count tiles.
   */
  async countTiles(
    tableName: string,
    options?: Pick<TileQueryOptions, "zoom">,
  ): Promise<number> {
    await yieldToEventLoop();
    return tiles.countTiles(this.db, tableName, options);
  }

  /**
   * Get available zoom levels.
   */
  async getAvailableZoomLevels(tableName: string): Promise<number[]> {
    await yieldToEventLoop();
    return tiles.getAvailableZoomLevels(this.db, tableName);
  }

  // ========== Extensions ==========

  /**
   * Add an extension.
   */
  async addExtension(extension: Extension): Promise<void> {
    await yieldToEventLoop();
    extensions.addExtension(this.db, extension);
  }

  /**
   * Get an extension.
   */
  async getExtension(
    extensionName: string,
    tableName?: string | null,
    columnName?: string | null,
  ): Promise<Extension | undefined> {
    await yieldToEventLoop();
    return extensions.getExtension(
      this.db,
      extensionName,
      tableName ?? null,
      columnName ?? null,
    );
  }

  /**
   * List all extensions.
   */
  async listExtensions(): Promise<Extension[]> {
    await yieldToEventLoop();
    return extensions.listExtensions(this.db);
  }

  /**
   * List extensions for a table.
   */
  async listTableExtensions(tableName: string): Promise<Extension[]> {
    await yieldToEventLoop();
    return extensions.listTableExtensions(this.db, tableName);
  }

  /**
   * List database-wide extensions.
   */
  async listDatabaseExtensions(): Promise<Extension[]> {
    await yieldToEventLoop();
    return extensions.listDatabaseExtensions(this.db);
  }

  /**
   * Check if an extension exists.
   */
  async hasExtension(
    extensionName: string,
    tableName?: string | null,
    columnName?: string | null,
  ): Promise<boolean> {
    await yieldToEventLoop();
    return extensions.hasExtension(
      this.db,
      extensionName,
      tableName ?? null,
      columnName ?? null,
    );
  }

  /**
   * Delete an extension.
   */
  async deleteExtension(
    extensionName: string,
    tableName?: string | null,
    columnName?: string | null,
  ): Promise<void> {
    await yieldToEventLoop();
    extensions.deleteExtension(
      this.db,
      extensionName,
      tableName ?? null,
      columnName ?? null,
    );
  }

  /**
   * Delete all extensions for a table.
   */
  async deleteTableExtensions(tableName: string): Promise<void> {
    await yieldToEventLoop();
    extensions.deleteTableExtensions(this.db, tableName);
  }
}
