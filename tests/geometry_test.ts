import { assertEquals } from "@std/assert";
import { decodeGeometry, encodeGeometry } from "../mod.ts";
import type { Geometry } from "../mod.ts";

Deno.test("Geometry - Encode and decode Point", () => {
  const point: Geometry = {
    type: "Point",
    coordinates: [-122.4, 37.8],
  };

  const encoded = encodeGeometry(point, { srsId: 4326 });
  const decoded = decodeGeometry(encoded);

  assertEquals(decoded.type, "Point");
  assertEquals(decoded.srsId, 4326);
  assertEquals((decoded.coordinates as number[])[0], -122.4);
  assertEquals((decoded.coordinates as number[])[1], 37.8);
});

Deno.test("Geometry - Encode and decode LineString", () => {
  const lineString: Geometry = {
    type: "LineString",
    coordinates: [
      [-122.4, 37.8],
      [-118.2, 34.0],
      [-73.9, 40.7],
    ],
  };

  const encoded = encodeGeometry(lineString, { srsId: 4326 });
  const decoded = decodeGeometry(encoded);

  assertEquals(decoded.type, "LineString");
  assertEquals((decoded.coordinates as number[][]).length, 3);
});

Deno.test("Geometry - Encode and decode Polygon", () => {
  const polygon: Geometry = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  };

  const encoded = encodeGeometry(polygon, { srsId: 4326 });
  const decoded = decodeGeometry(encoded);

  assertEquals(decoded.type, "Polygon");
  assertEquals((decoded.coordinates as number[][][]).length, 1);
  assertEquals((decoded.coordinates as number[][][])[0].length, 5);
});

Deno.test("Geometry - Encode and decode MultiPoint", () => {
  const multiPoint: Geometry = {
    type: "MultiPoint",
    coordinates: [
      [-122.4, 37.8],
      [-118.2, 34.0],
    ],
  };

  const encoded = encodeGeometry(multiPoint, { srsId: 4326 });
  const decoded = decodeGeometry(encoded);

  assertEquals(decoded.type, "MultiPoint");
  assertEquals((decoded.coordinates as number[][]).length, 2);
});

Deno.test("Geometry - Encode with envelope", () => {
  const point: Geometry = {
    type: "Point",
    coordinates: [-122.4, 37.8],
  };

  const encoded = encodeGeometry(point, { srsId: 4326, envelope: "xy" });
  const decoded = decodeGeometry(encoded);

  assertEquals(decoded.type, "Point");
  assertEquals(decoded.srsId, 4326);
});

Deno.test("Geometry - Encode null geometry", () => {
  const encoded = encodeGeometry(null, { srsId: 4326 });
  assertEquals(encoded.length > 0, true);
});

Deno.test("Geometry - Point with Z coordinate", () => {
  const point: Geometry = {
    type: "Point",
    coordinates: [-122.4, 37.8, 100.5],
  };

  const encoded = encodeGeometry(point, { srsId: 4326 });
  const decoded = decodeGeometry(encoded);

  assertEquals(decoded.type, "Point");
  assertEquals((decoded.coordinates as number[]).length, 3);
  assertEquals((decoded.coordinates as number[])[2], 100.5);
});
