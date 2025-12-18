/**
 * Geometry encoding and decoding for GeoPackage binary format.
 * @module
 */

import type { Geometry, GeometryFlags } from "./types.ts";
import { getGeometryTypeName, getWkbTypeCode } from "./utils.ts";

/**
 * GeoPackage binary geometry magic number (GP).
 */
const GEOPACKAGE_MAGIC = 0x4750; // "GP" in ASCII

/**
 * GeoPackage binary geometry version.
 */
const GEOPACKAGE_VERSION = 0x00;

/**
 * Encode a geometry to GeoPackage binary format.
 */
export function encodeGeometry(
  geometry: Geometry | null,
  options: {
    srsId?: number;
    envelope?: "none" | "xy" | "xyz" | "xym" | "xyzm";
  } = {},
): Uint8Array {
  if (geometry === null) {
    return encodeEmptyGeometry(options.srsId ?? 0);
  }

  const srsId = options.srsId ?? 0;
  const envelope = options.envelope ?? "none";
  const envelopeType = getEnvelopeType(envelope);

  // Calculate envelope if needed
  const envelopeData = envelopeType > 0
    ? calculateEnvelope(geometry, envelopeType)
    : null;

  // Encode WKB
  const wkb = encodeWkb(geometry);

  // Calculate total size
  const headerSize = 8; // Magic (2) + Version (1) + Flags (1) + SRID (4)
  const envelopeSize = getEnvelopeSize(envelopeType);
  const totalSize = headerSize + envelopeSize + wkb.length;

  // Create buffer
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);

  // Write header
  let offset = 0;

  // Magic number (2 bytes, big-endian)
  view.setUint16(offset, GEOPACKAGE_MAGIC, false);
  offset += 2;

  // Version (1 byte)
  view.setUint8(offset, GEOPACKAGE_VERSION);
  offset += 1;

  // Flags (1 byte)
  const flags = encodeFlags({
    binaryType: 0, // Standard WKB
    empty: false,
    envelopeType,
    byteOrder: 1, // Little-endian
  });
  view.setUint8(offset, flags);
  offset += 1;

  // SRID (4 bytes, big-endian)
  view.setInt32(offset, srsId, false);
  offset += 4;

  // Write envelope if present
  if (envelopeData) {
    for (const value of envelopeData) {
      view.setFloat64(offset, value, true); // Little-endian
      offset += 8;
    }
  }

  // Write WKB
  buffer.set(wkb, offset);

  return buffer;
}

/**
 * Decode a GeoPackage binary geometry.
 */
export function decodeGeometry(
  buffer: Uint8Array,
): Geometry & { srsId: number } {
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  let offset = 0;

  // Read magic number
  const magic = view.getUint16(offset, false);
  offset += 2;

  if (magic !== GEOPACKAGE_MAGIC) {
    throw new Error(
      `Invalid GeoPackage geometry magic number: 0x${magic.toString(16)}`,
    );
  }

  // Read version
  const version = view.getUint8(offset);
  offset += 1;

  if (version !== GEOPACKAGE_VERSION) {
    throw new Error(`Unsupported GeoPackage geometry version: ${version}`);
  }

  // Read flags
  const flagsByte = view.getUint8(offset);
  offset += 1;
  const flags = decodeFlags(flagsByte);

  // Read SRID
  const srsId = view.getInt32(offset, false);
  offset += 4;

  // Skip envelope
  const envelopeSize = getEnvelopeSize(flags.envelopeType);
  offset += envelopeSize;

  // Decode WKB
  const wkbBuffer = buffer.slice(offset);
  const geometry = decodeWkb(wkbBuffer);

  return { ...geometry, srsId };
}

/**
 * Encode empty geometry.
 */
function encodeEmptyGeometry(srsId: number): Uint8Array {
  const buffer = new Uint8Array(13); // Header (8) + WKB Point EMPTY (5)
  const view = new DataView(buffer.buffer);

  // Header
  view.setUint16(0, GEOPACKAGE_MAGIC, false);
  view.setUint8(2, GEOPACKAGE_VERSION);
  view.setUint8(
    3,
    encodeFlags({
      binaryType: 0,
      empty: true,
      envelopeType: 0,
      byteOrder: 1,
    }),
  );
  view.setInt32(4, srsId, false);

  // WKB Point EMPTY (little-endian, type 1, NaN coordinates)
  view.setUint8(8, 1); // Little-endian
  view.setUint32(9, 1, true); // Point type

  return buffer;
}

/**
 * Encode flags byte.
 */
function encodeFlags(flags: GeometryFlags): number {
  let byte = 0;
  byte |= (flags.binaryType & 0x01) << 5;
  byte |= (flags.empty ? 1 : 0) << 4;
  byte |= (flags.envelopeType & 0x07) << 1;
  byte |= flags.byteOrder & 0x01;
  return byte;
}

/**
 * Decode flags byte.
 */
function decodeFlags(byte: number): GeometryFlags {
  return {
    binaryType: ((byte >> 5) & 0x01) as 0 | 1,
    empty: ((byte >> 4) & 0x01) === 1,
    envelopeType: ((byte >> 1) & 0x07) as 0 | 1 | 2 | 3 | 4,
    byteOrder: (byte & 0x01) as 0 | 1,
  };
}

/**
 * Get envelope type code.
 */
function getEnvelopeType(envelope: string): 0 | 1 | 2 | 3 | 4 {
  switch (envelope) {
    case "none":
      return 0;
    case "xy":
      return 1;
    case "xyz":
      return 2;
    case "xym":
      return 3;
    case "xyzm":
      return 4;
    default:
      return 0;
  }
}

/**
 * Get envelope size in bytes.
 */
function getEnvelopeSize(envelopeType: number): number {
  switch (envelopeType) {
    case 0:
      return 0; // No envelope
    case 1:
      return 32; // minX, maxX, minY, maxY (4 * 8 bytes)
    case 2:
      return 48; // minX, maxX, minY, maxY, minZ, maxZ (6 * 8 bytes)
    case 3:
      return 48; // minX, maxX, minY, maxY, minM, maxM (6 * 8 bytes)
    case 4:
      return 64; // minX, maxX, minY, maxY, minZ, maxZ, minM, maxM (8 * 8 bytes)
    default:
      return 0;
  }
}

/**
 * Calculate envelope for geometry.
 */
function calculateEnvelope(geometry: Geometry, envelopeType: number): number[] {
  const coords = extractCoordinates(geometry);
  if (coords.length === 0) {
    return [];
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let minM = Infinity, maxM = -Infinity;

  for (const coord of coords) {
    minX = Math.min(minX, coord[0]);
    maxX = Math.max(maxX, coord[0]);
    minY = Math.min(minY, coord[1]);
    maxY = Math.max(maxY, coord[1]);

    if (coord.length > 2) {
      minZ = Math.min(minZ, coord[2]);
      maxZ = Math.max(maxZ, coord[2]);
    }
    if (coord.length > 3) {
      minM = Math.min(minM, coord[3]);
      maxM = Math.max(maxM, coord[3]);
    }
  }

  switch (envelopeType) {
    case 1:
      return [minX, maxX, minY, maxY];
    case 2:
      return [minX, maxX, minY, maxY, minZ, maxZ];
    case 3:
      return [minX, maxX, minY, maxY, minM, maxM];
    case 4:
      return [minX, maxX, minY, maxY, minZ, maxZ, minM, maxM];
    default:
      return [];
  }
}

/**
 * Extract all coordinates from geometry.
 */
function extractCoordinates(geometry: Geometry): number[][] {
  const coords: number[][] = [];

  function extract(geom: Geometry) {
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
 * Encode geometry to WKB (Well-Known Binary).
 */
function encodeWkb(geometry: Geometry): Uint8Array {
  const buffers: Uint8Array[] = [];
  const littleEndian = true;

  function writeUint8(value: number) {
    buffers.push(new Uint8Array([value]));
  }

  function writeUint32(value: number) {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, value, littleEndian);
    buffers.push(buf);
  }

  function writeFloat64(value: number) {
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setFloat64(0, value, littleEndian);
    buffers.push(buf);
  }

  function writePoint(coords: number[]) {
    writeFloat64(coords[0]);
    writeFloat64(coords[1]);
    if (coords.length > 2) writeFloat64(coords[2]);
    if (coords.length > 3) writeFloat64(coords[3]);
  }

  function getFirstCoord(geom: Geometry): number[] {
    if (geom.type === "Point") {
      return geom.coordinates as number[];
    } else if (geom.type === "LineString" || geom.type === "MultiPoint") {
      return (geom.coordinates as number[][])[0];
    } else if (geom.type === "Polygon" || geom.type === "MultiLineString") {
      return (geom.coordinates as number[][][])[0][0];
    } else if (geom.type === "MultiPolygon") {
      return (geom.coordinates as number[][][][])[0][0][0];
    }
    return [];
  }

  function writeGeometry(geom: Geometry) {
    // Byte order
    writeUint8(1); // Little-endian

    // Geometry type with Z/M flags
    let typeCode = getWkbTypeCode(geom.type);

    // Detect Z and M from first coordinate
    const firstCoord = getFirstCoord(geom);
    const hasZ = firstCoord.length >= 3;
    const hasM = firstCoord.length >= 4;

    // Add Z flag (1000) and M flag (2000) to type code
    if (hasZ && hasM) {
      typeCode += 3000; // XYZM
    } else if (hasM) {
      typeCode += 2000; // XYM
    } else if (hasZ) {
      typeCode += 1000; // XYZ
    }

    writeUint32(typeCode);

    // Geometry data
    if (geom.type === "Point") {
      writePoint(geom.coordinates as number[]);
    } else if (geom.type === "LineString") {
      const coords = geom.coordinates as number[][];
      writeUint32(coords.length);
      for (const coord of coords) {
        writePoint(coord);
      }
    } else if (geom.type === "Polygon") {
      const rings = geom.coordinates as number[][][];
      writeUint32(rings.length);
      for (const ring of rings) {
        writeUint32(ring.length);
        for (const coord of ring) {
          writePoint(coord);
        }
      }
    } else if (geom.type === "MultiPoint") {
      const coords = geom.coordinates as number[][];
      writeUint32(coords.length);
      for (const coord of coords) {
        writeGeometry({ type: "Point", coordinates: coord });
      }
    } else if (geom.type === "MultiLineString") {
      const lines = geom.coordinates as number[][][];
      writeUint32(lines.length);
      for (const line of lines) {
        writeGeometry({ type: "LineString", coordinates: line });
      }
    } else if (geom.type === "MultiPolygon") {
      const polygons = geom.coordinates as number[][][][];
      writeUint32(polygons.length);
      for (const polygon of polygons) {
        writeGeometry({ type: "Polygon", coordinates: polygon });
      }
    } else if (geom.type === "GeometryCollection") {
      const geometries = geom.geometries ?? [];
      writeUint32(geometries.length);
      for (const g of geometries) {
        writeGeometry(g);
      }
    }
  }

  writeGeometry(geometry);

  // Concatenate all buffers
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }

  return result;
}

/**
 * Decode WKB (Well-Known Binary) to geometry.
 */
function decodeWkb(buffer: Uint8Array): Geometry {
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  let offset = 0;

  function readUint8(): number {
    return view.getUint8(offset++);
  }

  function readUint32(littleEndian: boolean): number {
    const value = view.getUint32(offset, littleEndian);
    offset += 4;
    return value;
  }

  function readFloat64(littleEndian: boolean): number {
    const value = view.getFloat64(offset, littleEndian);
    offset += 8;
    return value;
  }

  function readPoint(littleEndian: boolean, dimensions: number): number[] {
    const coords: number[] = [];
    for (let i = 0; i < dimensions; i++) {
      coords.push(readFloat64(littleEndian));
    }
    return coords;
  }

  function readGeometry(): Geometry {
    const byteOrder = readUint8();
    const littleEndian = byteOrder === 1;

    const typeCode = readUint32(littleEndian);
    const baseType = typeCode % 1000;
    const typeName = getGeometryTypeName(baseType);

    // Determine dimensions (2D, Z, M, ZM)
    const hasZ = (typeCode >= 1000 && typeCode < 2000) || (typeCode >= 3000);
    const hasM = (typeCode >= 2000 && typeCode < 3000) || (typeCode >= 3000);
    const dimensions = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);

    if (typeName === "POINT") {
      return {
        type: "Point",
        coordinates: readPoint(littleEndian, dimensions),
      };
    } else if (typeName === "LINESTRING") {
      const numPoints = readUint32(littleEndian);
      const coordinates: number[][] = [];
      for (let i = 0; i < numPoints; i++) {
        coordinates.push(readPoint(littleEndian, dimensions));
      }
      return { type: "LineString", coordinates };
    } else if (typeName === "POLYGON") {
      const numRings = readUint32(littleEndian);
      const coordinates: number[][][] = [];
      for (let i = 0; i < numRings; i++) {
        const numPoints = readUint32(littleEndian);
        const ring: number[][] = [];
        for (let j = 0; j < numPoints; j++) {
          ring.push(readPoint(littleEndian, dimensions));
        }
        coordinates.push(ring);
      }
      return { type: "Polygon", coordinates };
    } else if (typeName === "MULTIPOINT") {
      const numPoints = readUint32(littleEndian);
      const coordinates: number[][] = [];
      for (let i = 0; i < numPoints; i++) {
        const point = readGeometry();
        if (point.type === "Point") {
          coordinates.push(point.coordinates as number[]);
        }
      }
      return { type: "MultiPoint", coordinates };
    } else if (typeName === "MULTILINESTRING") {
      const numLines = readUint32(littleEndian);
      const coordinates: number[][][] = [];
      for (let i = 0; i < numLines; i++) {
        const line = readGeometry();
        if (line.type === "LineString") {
          coordinates.push(line.coordinates as number[][]);
        }
      }
      return { type: "MultiLineString", coordinates };
    } else if (typeName === "MULTIPOLYGON") {
      const numPolygons = readUint32(littleEndian);
      const coordinates: number[][][][] = [];
      for (let i = 0; i < numPolygons; i++) {
        const polygon = readGeometry();
        if (polygon.type === "Polygon") {
          coordinates.push(polygon.coordinates as number[][][]);
        }
      }
      return { type: "MultiPolygon", coordinates };
    } else if (typeName === "GEOMETRYCOLLECTION") {
      const numGeometries = readUint32(littleEndian);
      const geometries: Geometry[] = [];
      for (let i = 0; i < numGeometries; i++) {
        geometries.push(readGeometry());
      }
      return { type: "GeometryCollection", coordinates: [], geometries };
    }

    throw new Error(`Unsupported geometry type: ${typeName}`);
  }

  return readGeometry();
}
