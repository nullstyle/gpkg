/**
 * Tile image format validation unit tests.
 */

import { assertEquals, assertExists, assertThrows } from "@std/assert";
import { detectTileFormat, GeoPackage, validateTileData } from "../mod.ts";

// Sample image magic bytes for testing
const PNG_HEADER = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a, // PNG magic
  0x00,
  0x00,
  0x00,
  0x0d, // IHDR chunk length
  0x49,
  0x48,
  0x44,
  0x52, // IHDR
]);

const JPEG_HEADER = new Uint8Array([
  0xff,
  0xd8,
  0xff,
  0xe0, // JPEG magic + APP0
  0x00,
  0x10,
  0x4a,
  0x46,
  0x49,
  0x46,
  0x00,
  0x01, // JFIF header
]);

const WEBP_HEADER = new Uint8Array([
  0x52,
  0x49,
  0x46,
  0x46, // RIFF
  0x24,
  0x00,
  0x00,
  0x00, // File size (placeholder)
  0x57,
  0x45,
  0x42,
  0x50, // WEBP
  0x56,
  0x50,
  0x38,
  0x20, // VP8
]);

const INVALID_DATA = new Uint8Array([
  0x00,
  0x01,
  0x02,
  0x03,
  0x04,
  0x05,
  0x06,
  0x07,
  0x08,
  0x09,
  0x0a,
  0x0b,
  0x0c,
  0x0d,
  0x0e,
  0x0f,
]);

// ============== Format Detection ==============

Deno.test("Tiles - Detect PNG format", () => {
  const format = detectTileFormat(PNG_HEADER);
  assertEquals(format, "png");
});

Deno.test("Tiles - Detect JPEG format", () => {
  const format = detectTileFormat(JPEG_HEADER);
  assertEquals(format, "jpeg");
});

Deno.test("Tiles - Detect WebP format", () => {
  const format = detectTileFormat(WEBP_HEADER);
  assertEquals(format, "webp");
});

Deno.test("Tiles - Detect unknown format", () => {
  const format = detectTileFormat(INVALID_DATA);
  assertEquals(format, "unknown");
});

Deno.test("Tiles - Detect format with empty data", () => {
  const format = detectTileFormat(new Uint8Array(0));
  assertEquals(format, "unknown");
});

Deno.test("Tiles - Detect format with too short data", () => {
  const format = detectTileFormat(new Uint8Array([0x89, 0x50]));
  assertEquals(format, "unknown");
});

// ============== Validation ==============

Deno.test("Tiles - Validate PNG data", () => {
  const format = validateTileData(PNG_HEADER, { validateFormat: true });
  assertEquals(format, "png");
});

Deno.test("Tiles - Validate JPEG data", () => {
  const format = validateTileData(JPEG_HEADER, { validateFormat: true });
  assertEquals(format, "jpeg");
});

Deno.test("Tiles - Validate WebP data", () => {
  const format = validateTileData(WEBP_HEADER, { validateFormat: true });
  assertEquals(format, "webp");
});

Deno.test("Tiles - Validation rejects unknown format", () => {
  assertThrows(
    () => validateTileData(INVALID_DATA, { validateFormat: true }),
    Error,
    "Unknown tile image format",
  );
});

Deno.test("Tiles - Validation with restricted formats", () => {
  // Only allow PNG
  const format = validateTileData(PNG_HEADER, {
    validateFormat: true,
    allowedFormats: ["png"],
  });
  assertEquals(format, "png");

  // JPEG should be rejected
  assertThrows(
    () =>
      validateTileData(JPEG_HEADER, {
        validateFormat: true,
        allowedFormats: ["png"],
      }),
    Error,
    "not allowed",
  );
});

Deno.test("Tiles - Validation without format check", () => {
  // Should return format but not throw even for unknown
  const format = validateTileData(INVALID_DATA, { validateFormat: false });
  assertEquals(format, "unknown");
});

// ============== Insert with Validation ==============

Deno.test("Tiles - Insert tile with format validation", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createTileMatrixSet({
    tableName: "validated_tiles",
    srsId: 3857,
    minX: -180,
    minY: -85,
    maxX: 180,
    maxY: 85,
  });

  gpkg.addTileMatrix({
    tableName: "validated_tiles",
    zoomLevel: 0,
    matrixWidth: 1,
    matrixHeight: 1,
    tileWidth: 256,
    tileHeight: 256,
    pixelXSize: 1,
    pixelYSize: 1,
  });

  // Insert valid PNG
  const id = gpkg.insertTile(
    "validated_tiles",
    {
      zoomLevel: 0,
      tileColumn: 0,
      tileRow: 0,
      tileData: PNG_HEADER,
    },
    { validateFormat: true },
  );

  assertEquals(typeof id, "number");

  // Verify tile was inserted
  const tile = gpkg.getTile("validated_tiles", { zoom: 0, column: 0, row: 0 });
  assertExists(tile);

  gpkg.close();
});

Deno.test("Tiles - Insert tile rejects invalid format when validation enabled", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createTileMatrixSet({
    tableName: "strict_tiles",
    srsId: 3857,
    minX: -180,
    minY: -85,
    maxX: 180,
    maxY: 85,
  });

  gpkg.addTileMatrix({
    tableName: "strict_tiles",
    zoomLevel: 0,
    matrixWidth: 1,
    matrixHeight: 1,
    tileWidth: 256,
    tileHeight: 256,
    pixelXSize: 1,
    pixelYSize: 1,
  });

  // Try to insert invalid data with validation
  assertThrows(
    () =>
      gpkg.insertTile(
        "strict_tiles",
        {
          zoomLevel: 0,
          tileColumn: 0,
          tileRow: 0,
          tileData: INVALID_DATA,
        },
        { validateFormat: true },
      ),
    Error,
    "Unknown tile image format",
  );

  gpkg.close();
});

Deno.test("Tiles - Insert tile accepts any data without validation", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createTileMatrixSet({
    tableName: "lenient_tiles",
    srsId: 3857,
    minX: -180,
    minY: -85,
    maxX: 180,
    maxY: 85,
  });

  gpkg.addTileMatrix({
    tableName: "lenient_tiles",
    zoomLevel: 0,
    matrixWidth: 1,
    matrixHeight: 1,
    tileWidth: 256,
    tileHeight: 256,
    pixelXSize: 1,
    pixelYSize: 1,
  });

  // Insert arbitrary data without validation (default behavior)
  const id = gpkg.insertTile("lenient_tiles", {
    zoomLevel: 0,
    tileColumn: 0,
    tileRow: 0,
    tileData: INVALID_DATA,
  });

  assertEquals(typeof id, "number");

  gpkg.close();
});

Deno.test("Tiles - Insert with format restriction", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createTileMatrixSet({
    tableName: "png_only",
    srsId: 3857,
    minX: -180,
    minY: -85,
    maxX: 180,
    maxY: 85,
  });

  gpkg.addTileMatrix({
    tableName: "png_only",
    zoomLevel: 0,
    matrixWidth: 2,
    matrixHeight: 2,
    tileWidth: 256,
    tileHeight: 256,
    pixelXSize: 1,
    pixelYSize: 1,
  });

  // PNG should be accepted
  gpkg.insertTile(
    "png_only",
    {
      zoomLevel: 0,
      tileColumn: 0,
      tileRow: 0,
      tileData: PNG_HEADER,
    },
    { validateFormat: true, allowedFormats: ["png"] },
  );

  // JPEG should be rejected
  assertThrows(
    () =>
      gpkg.insertTile(
        "png_only",
        {
          zoomLevel: 0,
          tileColumn: 1,
          tileRow: 0,
          tileData: JPEG_HEADER,
        },
        { validateFormat: true, allowedFormats: ["png"] },
      ),
    Error,
    "not allowed",
  );

  gpkg.close();
});

// ============== GeoPackage Methods ==============

Deno.test("Tiles - detectTileFormat method on GeoPackage", () => {
  const gpkg = new GeoPackage(":memory:");

  assertEquals(gpkg.detectTileFormat(PNG_HEADER), "png");
  assertEquals(gpkg.detectTileFormat(JPEG_HEADER), "jpeg");
  assertEquals(gpkg.detectTileFormat(WEBP_HEADER), "webp");
  assertEquals(gpkg.detectTileFormat(INVALID_DATA), "unknown");

  gpkg.close();
});

Deno.test("Tiles - validateTileData method on GeoPackage", () => {
  const gpkg = new GeoPackage(":memory:");

  assertEquals(gpkg.validateTileData(PNG_HEADER), "png");

  assertThrows(
    () => gpkg.validateTileData(INVALID_DATA),
    Error,
    "Unknown tile image format",
  );

  gpkg.close();
});

// ============== Edge Cases ==============

Deno.test("Tiles - PNG with extra data after header", () => {
  const pngWithExtraData = new Uint8Array(1000);
  pngWithExtraData.set(PNG_HEADER, 0);
  // Fill rest with random data
  for (let i = PNG_HEADER.length; i < 1000; i++) {
    pngWithExtraData[i] = Math.floor(Math.random() * 256);
  }

  const format = detectTileFormat(pngWithExtraData);
  assertEquals(format, "png");
});

Deno.test("Tiles - JPEG variants", () => {
  // JPEG with different APP markers
  const jpegApp1 = new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe1, // JPEG + APP1 (EXIF)
    0x00,
    0x10,
    0x45,
    0x78,
    0x69,
    0x66,
    0x00,
    0x00,
  ]);

  assertEquals(detectTileFormat(jpegApp1), "jpeg");
});

Deno.test("Tiles - Almost valid headers", () => {
  // PNG with one byte wrong
  const almostPng = new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x48, // Changed G to H
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0x00,
    0x00,
    0x00,
    0x0d,
  ]);

  assertEquals(detectTileFormat(almostPng), "unknown");

  // JPEG with wrong marker
  const almostJpeg = new Uint8Array([
    0xff,
    0xd9,
    0xff,
    0xe0, // D9 instead of D8
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
  ]);

  assertEquals(detectTileFormat(almostJpeg), "unknown");
});

Deno.test("Tiles - WebP without WEBP signature", () => {
  // RIFF but not WEBP
  const riffNotWebp = new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46, // RIFF
    0x24,
    0x00,
    0x00,
    0x00, // Size
    0x57,
    0x41,
    0x56,
    0x45, // WAVE instead of WEBP
    0x66,
    0x6d,
    0x74,
    0x20,
  ]);

  assertEquals(detectTileFormat(riffNotWebp), "unknown");
});

Deno.test("Tiles - Multiple tile insertion with validation", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createTileMatrixSet({
    tableName: "multi_tiles",
    srsId: 3857,
    minX: -180,
    minY: -85,
    maxX: 180,
    maxY: 85,
  });

  gpkg.addTileMatrix({
    tableName: "multi_tiles",
    zoomLevel: 0,
    matrixWidth: 2,
    matrixHeight: 2,
    tileWidth: 256,
    tileHeight: 256,
    pixelXSize: 1,
    pixelYSize: 1,
  });

  // Insert different formats
  gpkg.insertTile(
    "multi_tiles",
    { zoomLevel: 0, tileColumn: 0, tileRow: 0, tileData: PNG_HEADER },
    { validateFormat: true },
  );

  gpkg.insertTile(
    "multi_tiles",
    { zoomLevel: 0, tileColumn: 1, tileRow: 0, tileData: JPEG_HEADER },
    { validateFormat: true },
  );

  gpkg.insertTile(
    "multi_tiles",
    { zoomLevel: 0, tileColumn: 0, tileRow: 1, tileData: WEBP_HEADER },
    { validateFormat: true },
  );

  // Query tiles
  const tiles = gpkg.queryTiles("multi_tiles");
  assertEquals(tiles.length, 3);

  // Verify formats - tiles are ordered by (zoom, column, row)
  // So order is: (0,0,0)=PNG, (0,0,1)=WEBP, (0,1,0)=JPEG
  assertEquals(gpkg.detectTileFormat(tiles[0].tileData), "png");
  assertEquals(gpkg.detectTileFormat(tiles[1].tileData), "webp");
  assertEquals(gpkg.detectTileFormat(tiles[2].tileData), "jpeg");

  gpkg.close();
});

Deno.test("Tiles - Allow only WebP format", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createTileMatrixSet({
    tableName: "webp_only",
    srsId: 3857,
    minX: -180,
    minY: -85,
    maxX: 180,
    maxY: 85,
  });

  gpkg.addTileMatrix({
    tableName: "webp_only",
    zoomLevel: 0,
    matrixWidth: 1,
    matrixHeight: 1,
    tileWidth: 256,
    tileHeight: 256,
    pixelXSize: 1,
    pixelYSize: 1,
  });

  // WebP should be accepted
  gpkg.insertTile(
    "webp_only",
    {
      zoomLevel: 0,
      tileColumn: 0,
      tileRow: 0,
      tileData: WEBP_HEADER,
    },
    { validateFormat: true, allowedFormats: ["webp"] },
  );

  const tile = gpkg.getTile("webp_only", { zoom: 0, column: 0, row: 0 });
  assertExists(tile);
  assertEquals(gpkg.detectTileFormat(tile.tileData), "webp");

  gpkg.close();
});
