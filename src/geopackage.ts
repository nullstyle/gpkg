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
 * GeoPackage database manager.
 */
export class GeoPackage {
  private db: Database;
  private _path: string;
  private _closed = false;

  /**
   * Create or open a GeoPackage database.
   *
   * @param path - Path to the GeoPackage file, or ":memory:" for in-memory database
   * @param options - Database options
   */
  constructor(path: string, options: GeoPackageOptions = {}) {
    this._path = path;

    // Open database
    this.db = new Database(path, {
      create: options.create ?? true,
      readonly: options.readonly ?? false,
      memory: options.memory ?? path === ":memory:",
    });

    // Initialize GeoPackage tables if creating new database
    if (!options.readonly) {
      this.initializeTables();
    }
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
  close(): void {
    if (!this._closed) {
      this.db.close();
      this._closed = true;
    }
  }

  /**
   * Execute a transaction.
   */
  transaction<T>(fn: () => T): T {
    const txn = this.db.transaction(fn);
    return txn();
  }

  // ========== Spatial Reference Systems ==========

  /**
   * Get a spatial reference system by ID.
   */
  getSpatialReferenceSystem(srsId: number): SpatialReferenceSystem | undefined {
    return srs.getSpatialReferenceSystem(this.db, srsId);
  }

  /**
   * List all spatial reference systems.
   */
  listSpatialReferenceSystems(): SpatialReferenceSystem[] {
    return srs.listSpatialReferenceSystems(this.db);
  }

  /**
   * Add a new spatial reference system.
   */
  addSpatialReferenceSystem(srsData: SpatialReferenceSystem): void {
    srs.addSpatialReferenceSystem(this.db, srsData);
  }

  /**
   * Update an existing spatial reference system.
   */
  updateSpatialReferenceSystem(srsData: SpatialReferenceSystem): void {
    srs.updateSpatialReferenceSystem(this.db, srsData);
  }

  /**
   * Delete a spatial reference system.
   */
  deleteSpatialReferenceSystem(srsId: number): void {
    srs.deleteSpatialReferenceSystem(this.db, srsId);
  }

  /**
   * Check if a spatial reference system exists.
   */
  hasSpatialReferenceSystem(srsId: number): boolean {
    return srs.hasSpatialReferenceSystem(this.db, srsId);
  }

  // ========== Contents ==========

  /**
   * Get content entry by table name.
   */
  getContent(tableName: string): Content | undefined {
    return contents.getContent(this.db, tableName);
  }

  /**
   * List all content entries.
   */
  listContents(): Content[] {
    return contents.listContents(this.db);
  }

  /**
   * List contents by data type.
   */
  listContentsByType(dataType: "features" | "tiles" | "attributes"): Content[] {
    return contents.listContentsByType(this.db, dataType);
  }

  /**
   * Add a new content entry.
   */
  addContent(content: Content): void {
    contents.addContent(this.db, content);
  }

  /**
   * Update an existing content entry.
   */
  updateContent(content: Content): void {
    contents.updateContent(this.db, content);
  }

  /**
   * Update the bounding box for a content entry.
   */
  updateContentBounds(tableName: string, bounds: BoundingBox): void {
    contents.updateContentBounds(this.db, tableName, bounds);
  }

  /**
   * Delete a content entry.
   */
  deleteContent(tableName: string): void {
    contents.deleteContent(this.db, tableName);
  }

  /**
   * Check if a content entry exists.
   */
  hasContent(tableName: string): boolean {
    return contents.hasContent(this.db, tableName);
  }

  // ========== Features ==========

  /**
   * Create a feature table.
   */
  createFeatureTable(config: FeatureTableConfig): void {
    features.createFeatureTable(this.db, config);
  }

  /**
   * Get geometry column metadata.
   */
  getGeometryColumn(tableName: string): GeometryColumn | undefined {
    return features.getGeometryColumn(this.db, tableName);
  }

  /**
   * List all geometry columns.
   */
  listGeometryColumns(): GeometryColumn[] {
    return features.listGeometryColumns(this.db);
  }

  /**
   * Insert a feature into a table.
   */
  insertFeature<T = Record<string, unknown>>(
    tableName: string,
    feature: Omit<Feature<T>, "id">,
  ): number {
    return features.insertFeature(this.db, tableName, feature);
  }

  /**
   * Get a feature by ID.
   */
  getFeature<T = Record<string, unknown>>(
    tableName: string,
    id: number,
  ): Feature<T> | undefined {
    return features.getFeature(this.db, tableName, id);
  }

  /**
   * Query features from a table.
   */
  queryFeatures<T = Record<string, unknown>>(
    tableName: string,
    options?: FeatureQueryOptions,
  ): Feature<T>[] {
    return features.queryFeatures(this.db, tableName, options);
  }

  /**
   * Iterate over all features in a table.
   */
  iterateFeatures<T = Record<string, unknown>>(
    tableName: string,
  ): Generator<Feature<T>> {
    return features.iterateFeatures(this.db, tableName);
  }

  /**
   * Update a feature.
   */
  updateFeature<T = Record<string, unknown>>(
    tableName: string,
    id: number,
    updates: Partial<Omit<Feature<T>, "id">>,
  ): void {
    features.updateFeature(this.db, tableName, id, updates);
  }

  /**
   * Delete a feature.
   */
  deleteFeature(tableName: string, id: number): void {
    features.deleteFeature(this.db, tableName, id);
  }

  /**
   * Count features in a table.
   */
  countFeatures(
    tableName: string,
    options?: Pick<FeatureQueryOptions, "where" | "bounds">,
  ): number {
    return features.countFeatures(this.db, tableName, options);
  }

  /**
   * Calculate bounding box of all features in a table.
   */
  calculateFeatureBounds(tableName: string): BoundingBox | undefined {
    return features.calculateFeatureBounds(this.db, tableName);
  }

  // ========== Spatial Index ==========

  /**
   * Check if a spatial index exists for a feature table.
   */
  hasSpatialIndex(tableName: string): boolean {
    return rtree.hasSpatialIndex(this.db, tableName);
  }

  /**
   * Create a spatial index for a feature table.
   * The index will be automatically maintained during insert/update/delete operations.
   */
  createSpatialIndex(tableName: string): void {
    rtree.createSpatialIndex(this.db, tableName);
  }

  /**
   * Drop a spatial index for a feature table.
   */
  dropSpatialIndex(tableName: string): void {
    rtree.dropSpatialIndex(this.db, tableName);
  }

  /**
   * Rebuild the spatial index from existing feature data.
   * Useful if the index gets out of sync.
   */
  rebuildSpatialIndex(tableName: string): void {
    rtree.populateSpatialIndex(this.db, tableName);
  }

  // ========== Schema (Data Columns) ==========

  /**
   * Add a data column definition with metadata.
   */
  addDataColumn(column: schema.DataColumn): void {
    schema.addDataColumn(this.db, column);
  }

  /**
   * Get a data column definition.
   */
  getDataColumn(
    tableName: string,
    columnName: string,
  ): schema.DataColumn | undefined {
    return schema.getDataColumn(this.db, tableName, columnName);
  }

  /**
   * List all data column definitions for a table.
   */
  listDataColumns(tableName: string): schema.DataColumn[] {
    return schema.listDataColumns(this.db, tableName);
  }

  /**
   * Update a data column definition.
   */
  updateDataColumn(column: schema.DataColumn): void {
    schema.updateDataColumn(this.db, column);
  }

  /**
   * Delete a data column definition.
   */
  deleteDataColumn(tableName: string, columnName: string): void {
    schema.deleteDataColumn(this.db, tableName, columnName);
  }

  /**
   * Add a range constraint.
   */
  addRangeConstraint(
    constraint: Omit<schema.RangeConstraint, "constraintType">,
  ): void {
    schema.addRangeConstraint(this.db, constraint);
  }

  /**
   * Add an enum constraint value.
   */
  addEnumConstraint(
    constraint: Omit<schema.EnumConstraint, "constraintType">,
  ): void {
    schema.addEnumConstraint(this.db, constraint);
  }

  /**
   * Add a glob constraint (pattern matching).
   */
  addGlobConstraint(
    constraint: Omit<schema.GlobConstraint, "constraintType">,
  ): void {
    schema.addGlobConstraint(this.db, constraint);
  }

  /**
   * Get all constraints with a given name.
   */
  getConstraints(constraintName: string): schema.DataColumnConstraint[] {
    return schema.getConstraints(this.db, constraintName);
  }

  /**
   * Get enum values for a constraint.
   */
  getEnumValues(constraintName: string): string[] {
    return schema.getEnumValues(this.db, constraintName);
  }

  /**
   * Get range constraint details.
   */
  getRangeConstraint(
    constraintName: string,
  ): schema.RangeConstraint | undefined {
    return schema.getRangeConstraint(this.db, constraintName);
  }

  /**
   * List all constraint names.
   */
  listConstraintNames(): string[] {
    return schema.listConstraintNames(this.db);
  }

  /**
   * Delete a constraint.
   */
  deleteConstraint(constraintName: string): void {
    schema.deleteConstraint(this.db, constraintName);
  }

  /**
   * Validate a value against a constraint.
   */
  validateValueAgainstConstraint(
    constraintName: string,
    value: unknown,
  ): boolean {
    return schema.validateValueAgainstConstraint(
      this.db,
      constraintName,
      value,
    );
  }

  // ========== GeoJSON ==========

  /**
   * Export features from a table to GeoJSON FeatureCollection.
   */
  toGeoJSON(
    tableName: string,
    options?: geojson.ToGeoJSONOptions,
  ): geojson.GeoJSONFeatureCollection {
    return geojson.toGeoJSON(this.db, tableName, options);
  }

  /**
   * Import features from GeoJSON FeatureCollection into a table.
   * Creates a new table or appends to existing one.
   */
  fromGeoJSON(
    geojsonData: geojson.GeoJSONFeatureCollection,
    options: geojson.FromGeoJSONOptions,
  ): { tableName: string; insertedCount: number } {
    return geojson.fromGeoJSON(this.db, geojsonData, options);
  }

  // ========== Attributes ==========

  /**
   * Create an attribute table (non-spatial table).
   */
  createAttributeTable(config: AttributeTableConfig): void {
    attributes.createAttributeTable(this.db, config);
  }

  /**
   * Insert a row into an attribute table.
   */
  insertAttribute<T = Record<string, unknown>>(
    tableName: string,
    row: Omit<attributes.AttributeRow<T>, "id">,
  ): number {
    return attributes.insertAttribute(this.db, tableName, row);
  }

  /**
   * Get an attribute row by ID.
   */
  getAttribute<T = Record<string, unknown>>(
    tableName: string,
    id: number,
  ): attributes.AttributeRow<T> | undefined {
    return attributes.getAttribute(this.db, tableName, id);
  }

  /**
   * Query rows from an attribute table.
   */
  queryAttributes<T = Record<string, unknown>>(
    tableName: string,
    options?: attributes.AttributeQueryOptions,
  ): attributes.AttributeRow<T>[] {
    return attributes.queryAttributes(this.db, tableName, options);
  }

  /**
   * Update an attribute row.
   */
  updateAttribute<T = Record<string, unknown>>(
    tableName: string,
    id: number,
    updates: Partial<T>,
  ): void {
    attributes.updateAttribute(this.db, tableName, id, updates);
  }

  /**
   * Delete an attribute row.
   */
  deleteAttribute(tableName: string, id: number): void {
    attributes.deleteAttribute(this.db, tableName, id);
  }

  /**
   * Count rows in an attribute table.
   */
  countAttributes(
    tableName: string,
    options?: Pick<attributes.AttributeQueryOptions, "where">,
  ): number {
    return attributes.countAttributes(this.db, tableName, options);
  }

  // ========== Tiles ==========

  /**
   * Create a tile matrix set and tile pyramid table.
   */
  createTileMatrixSet(config: TileMatrixSet): void {
    tiles.createTileMatrixSet(this.db, config);
  }

  /**
   * Get tile matrix set by table name.
   */
  getTileMatrixSet(tableName: string): TileMatrixSet | undefined {
    return tiles.getTileMatrixSet(this.db, tableName);
  }

  /**
   * List all tile matrix sets.
   */
  listTileMatrixSets(): TileMatrixSet[] {
    return tiles.listTileMatrixSets(this.db);
  }

  /**
   * Add a tile matrix (zoom level) to a tile matrix set.
   */
  addTileMatrix(matrix: TileMatrix): void {
    tiles.addTileMatrix(this.db, matrix);
  }

  /**
   * Get tile matrix by table name and zoom level.
   */
  getTileMatrix(tableName: string, zoomLevel: number): TileMatrix | undefined {
    return tiles.getTileMatrix(this.db, tableName, zoomLevel);
  }

  /**
   * List all tile matrices for a table.
   */
  listTileMatrices(tableName: string): TileMatrix[] {
    return tiles.listTileMatrices(this.db, tableName);
  }

  /**
   * Insert a tile into a tile pyramid table.
   * @param tableName - The tile table name
   * @param tile - The tile data to insert
   * @param validationOptions - Optional validation options for tile image format
   */
  insertTile(
    tableName: string,
    tile: Omit<Tile, "id">,
    validationOptions?: tiles.TileValidationOptions,
  ): number {
    return tiles.insertTile(this.db, tableName, tile, validationOptions);
  }

  /**
   * Detect the image format of tile data.
   * @returns The detected format: "png", "jpeg", "webp", or "unknown"
   */
  detectTileFormat(data: Uint8Array): tiles.TileImageFormat {
    return tiles.detectTileFormat(data);
  }

  /**
   * Validate tile image data.
   * @throws Error if the image format is unknown or not allowed
   */
  validateTileData(
    data: Uint8Array,
    options?: tiles.TileValidationOptions,
  ): tiles.TileImageFormat {
    return tiles.validateTileData(data, options);
  }

  /**
   * Get a tile by coordinates.
   */
  getTile(
    tableName: string,
    coords: { zoom: number; column: number; row: number },
  ): Tile | undefined {
    return tiles.getTile(this.db, tableName, coords);
  }

  /**
   * Query tiles from a table.
   */
  queryTiles(tableName: string, options?: TileQueryOptions): Tile[] {
    return tiles.queryTiles(this.db, tableName, options);
  }

  /**
   * Delete a tile.
   */
  deleteTile(
    tableName: string,
    coords: { zoom: number; column: number; row: number },
  ): void {
    tiles.deleteTile(this.db, tableName, coords);
  }

  /**
   * Count tiles in a table.
   */
  countTiles(
    tableName: string,
    options?: Pick<TileQueryOptions, "zoom">,
  ): number {
    return tiles.countTiles(this.db, tableName, options);
  }

  /**
   * Get available zoom levels for a tile table.
   */
  getAvailableZoomLevels(tableName: string): number[] {
    return tiles.getAvailableZoomLevels(this.db, tableName);
  }

  // ========== Extensions ==========

  /**
   * Add an extension registration.
   */
  addExtension(extension: Extension): void {
    extensions.addExtension(this.db, extension);
  }

  /**
   * Get an extension registration.
   */
  getExtension(
    extensionName: string,
    tableName?: string | null,
    columnName?: string | null,
  ): Extension | undefined {
    return extensions.getExtension(
      this.db,
      extensionName,
      tableName,
      columnName,
    );
  }

  /**
   * List all extension registrations.
   */
  listExtensions(): Extension[] {
    return extensions.listExtensions(this.db);
  }

  /**
   * List extensions for a specific table.
   */
  listTableExtensions(tableName: string): Extension[] {
    return extensions.listTableExtensions(this.db, tableName);
  }

  /**
   * List database-wide extensions.
   */
  listDatabaseExtensions(): Extension[] {
    return extensions.listDatabaseExtensions(this.db);
  }

  /**
   * Check if an extension is registered.
   */
  hasExtension(
    extensionName: string,
    tableName?: string | null,
    columnName?: string | null,
  ): boolean {
    return extensions.hasExtension(
      this.db,
      extensionName,
      tableName,
      columnName,
    );
  }

  /**
   * Delete an extension registration.
   */
  deleteExtension(
    extensionName: string,
    tableName?: string | null,
    columnName?: string | null,
  ): void {
    extensions.deleteExtension(this.db, extensionName, tableName, columnName);
  }

  /**
   * Delete all extensions for a table.
   */
  deleteTableExtensions(tableName: string): void {
    extensions.deleteTableExtensions(this.db, tableName);
  }
}
