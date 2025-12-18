/**
 * Schema extension (gpkg_data_columns) unit tests.
 */

import { assertEquals, assertExists, assertThrows } from "@std/assert";
import { GeoPackage } from "../mod.ts";

// ============== Data Column Definitions ==============

Deno.test("Schema - Add and get data column definition", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "cities",
    geometryType: "POINT",
    srsId: 4326,
    columns: [
      { name: "name", type: "TEXT" },
      { name: "population", type: "INTEGER" },
    ],
  });

  // Add data column definition
  gpkg.addDataColumn({
    tableName: "cities",
    columnName: "name",
    name: "city_name",
    title: "City Name",
    description: "The official name of the city",
  });

  // Get data column definition
  const col = gpkg.getDataColumn("cities", "name");
  assertExists(col);
  assertEquals(col.tableName, "cities");
  assertEquals(col.columnName, "name");
  assertEquals(col.name, "city_name");
  assertEquals(col.title, "City Name");
  assertEquals(col.description, "The official name of the city");

  gpkg.close();
});

Deno.test("Schema - Add data column with mime type", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "documents",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "content", type: "BLOB" }],
  });

  gpkg.addDataColumn({
    tableName: "documents",
    columnName: "content",
    title: "Document Content",
    mimeType: "application/pdf",
  });

  const col = gpkg.getDataColumn("documents", "content");
  assertExists(col);
  assertEquals(col.mimeType, "application/pdf");

  gpkg.close();
});

Deno.test("Schema - List data columns for table", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "places",
    geometryType: "POINT",
    srsId: 4326,
    columns: [
      { name: "name", type: "TEXT" },
      { name: "category", type: "TEXT" },
      { name: "rating", type: "REAL" },
    ],
  });

  gpkg.addDataColumn({
    tableName: "places",
    columnName: "name",
    title: "Place Name",
  });

  gpkg.addDataColumn({
    tableName: "places",
    columnName: "category",
    title: "Category",
  });

  gpkg.addDataColumn({
    tableName: "places",
    columnName: "rating",
    title: "Rating",
  });

  const columns = gpkg.listDataColumns("places");
  assertEquals(columns.length, 3);

  // Should be sorted by column name
  assertEquals(columns[0].columnName, "category");
  assertEquals(columns[1].columnName, "name");
  assertEquals(columns[2].columnName, "rating");

  gpkg.close();
});

Deno.test("Schema - Update data column definition", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "items",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "status", type: "TEXT" }],
  });

  gpkg.addDataColumn({
    tableName: "items",
    columnName: "status",
    title: "Item Status",
  });

  // Update the definition
  gpkg.updateDataColumn({
    tableName: "items",
    columnName: "status",
    title: "Current Status",
    description: "The current status of the item",
  });

  const col = gpkg.getDataColumn("items", "status");
  assertExists(col);
  assertEquals(col.title, "Current Status");
  assertEquals(col.description, "The current status of the item");

  gpkg.close();
});

Deno.test("Schema - Delete data column definition", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "test_table",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "field", type: "TEXT" }],
  });

  gpkg.addDataColumn({
    tableName: "test_table",
    columnName: "field",
    title: "Test Field",
  });

  // Verify it exists
  assertExists(gpkg.getDataColumn("test_table", "field"));

  // Delete it
  gpkg.deleteDataColumn("test_table", "field");

  // Verify it's gone
  assertEquals(gpkg.getDataColumn("test_table", "field"), undefined);

  gpkg.close();
});

Deno.test("Schema - Cannot add duplicate data column definition", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "dup_test",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "field", type: "TEXT" }],
  });

  gpkg.addDataColumn({
    tableName: "dup_test",
    columnName: "field",
    title: "First",
  });

  assertThrows(
    () => {
      gpkg.addDataColumn({
        tableName: "dup_test",
        columnName: "field",
        title: "Second",
      });
    },
    Error,
    "already exists",
  );

  gpkg.close();
});

Deno.test("Schema - Cannot add data column for non-existent table", () => {
  const gpkg = new GeoPackage(":memory:");

  assertThrows(
    () => {
      gpkg.addDataColumn({
        tableName: "nonexistent",
        columnName: "field",
        title: "Test",
      });
    },
    Error,
    "not found in gpkg_contents",
  );

  gpkg.close();
});

// ============== Range Constraints ==============

Deno.test("Schema - Add and get range constraint", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addRangeConstraint({
    constraintName: "percent",
    min: 0,
    max: 100,
    description: "Percentage value between 0 and 100",
  });

  const constraint = gpkg.getRangeConstraint("percent");
  assertExists(constraint);
  assertEquals(constraint.constraintType, "range");
  assertEquals(constraint.min, 0);
  assertEquals(constraint.max, 100);
  assertEquals(constraint.minIsInclusive, true);
  assertEquals(constraint.maxIsInclusive, true);
  assertEquals(constraint.description, "Percentage value between 0 and 100");

  gpkg.close();
});

Deno.test("Schema - Range constraint with exclusive bounds", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addRangeConstraint({
    constraintName: "positive",
    min: 0,
    minIsInclusive: false,
    description: "Strictly positive numbers",
  });

  const constraint = gpkg.getRangeConstraint("positive");
  assertExists(constraint);
  assertEquals(constraint.min, 0);
  assertEquals(constraint.minIsInclusive, false);
  assertEquals(constraint.max, undefined);

  gpkg.close();
});

Deno.test("Schema - Range constraint min only", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addRangeConstraint({
    constraintName: "min_only",
    min: 10,
  });

  const constraint = gpkg.getRangeConstraint("min_only");
  assertExists(constraint);
  assertEquals(constraint.min, 10);
  assertEquals(constraint.max, undefined);

  gpkg.close();
});

Deno.test("Schema - Range constraint max only", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addRangeConstraint({
    constraintName: "max_only",
    max: 1000,
  });

  const constraint = gpkg.getRangeConstraint("max_only");
  assertExists(constraint);
  assertEquals(constraint.min, undefined);
  assertEquals(constraint.max, 1000);

  gpkg.close();
});

Deno.test("Schema - Range constraint must have min or max", () => {
  const gpkg = new GeoPackage(":memory:");

  assertThrows(
    () => {
      gpkg.addRangeConstraint({
        constraintName: "invalid",
      });
    },
    Error,
    "must have at least min or max",
  );

  gpkg.close();
});

// ============== Enum Constraints ==============

Deno.test("Schema - Add enum constraint with multiple values", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addEnumConstraint({
    constraintName: "status",
    value: "active",
  });

  gpkg.addEnumConstraint({
    constraintName: "status",
    value: "inactive",
  });

  gpkg.addEnumConstraint({
    constraintName: "status",
    value: "pending",
  });

  const values = gpkg.getEnumValues("status");
  assertEquals(values.length, 3);
  assertEquals(values.includes("active"), true);
  assertEquals(values.includes("inactive"), true);
  assertEquals(values.includes("pending"), true);

  gpkg.close();
});

Deno.test("Schema - Get constraints returns all entries", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addEnumConstraint({
    constraintName: "priority",
    value: "low",
    description: "Low priority",
  });

  gpkg.addEnumConstraint({
    constraintName: "priority",
    value: "medium",
  });

  gpkg.addEnumConstraint({
    constraintName: "priority",
    value: "high",
  });

  const constraints = gpkg.getConstraints("priority");
  assertEquals(constraints.length, 3);

  for (const c of constraints) {
    assertEquals(c.constraintType, "enum");
    assertEquals(c.constraintName, "priority");
  }

  gpkg.close();
});

// ============== Glob Constraints ==============

Deno.test("Schema - Add glob constraint", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addGlobConstraint({
    constraintName: "email_pattern",
    value: "*@*.*",
    description: "Simple email pattern",
  });

  const constraints = gpkg.getConstraints("email_pattern");
  assertEquals(constraints.length, 1);
  assertEquals(constraints[0].constraintType, "glob");
  if (constraints[0].constraintType === "glob") {
    assertEquals(constraints[0].value, "*@*.*");
  }

  gpkg.close();
});

// ============== Data Column with Constraint ==============

Deno.test("Schema - Data column with constraint reference", () => {
  const gpkg = new GeoPackage(":memory:");

  // Create constraint first
  gpkg.addEnumConstraint({ constraintName: "yesno", value: "yes" });
  gpkg.addEnumConstraint({ constraintName: "yesno", value: "no" });

  gpkg.createFeatureTable({
    tableName: "survey",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "response", type: "TEXT" }],
  });

  // Add data column with constraint
  gpkg.addDataColumn({
    tableName: "survey",
    columnName: "response",
    title: "Survey Response",
    constraintName: "yesno",
  });

  const col = gpkg.getDataColumn("survey", "response");
  assertExists(col);
  assertEquals(col.constraintName, "yesno");

  gpkg.close();
});

Deno.test("Schema - Cannot add data column with non-existent constraint", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "test",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "field", type: "TEXT" }],
  });

  assertThrows(
    () => {
      gpkg.addDataColumn({
        tableName: "test",
        columnName: "field",
        constraintName: "nonexistent",
      });
    },
    Error,
    "not found",
  );

  gpkg.close();
});

// ============== Constraint Deletion ==============

Deno.test("Schema - Delete constraint", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addEnumConstraint({ constraintName: "to_delete", value: "a" });
  gpkg.addEnumConstraint({ constraintName: "to_delete", value: "b" });

  // Verify exists
  assertEquals(gpkg.getEnumValues("to_delete").length, 2);

  // Delete
  gpkg.deleteConstraint("to_delete");

  // Verify gone
  assertEquals(gpkg.getConstraints("to_delete").length, 0);

  gpkg.close();
});

Deno.test("Schema - Cannot delete constraint in use", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addEnumConstraint({ constraintName: "in_use", value: "x" });

  gpkg.createFeatureTable({
    tableName: "using_constraint",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "field", type: "TEXT" }],
  });

  gpkg.addDataColumn({
    tableName: "using_constraint",
    columnName: "field",
    constraintName: "in_use",
  });

  assertThrows(
    () => {
      gpkg.deleteConstraint("in_use");
    },
    Error,
    "referenced by",
  );

  gpkg.close();
});

Deno.test("Schema - List all constraint names", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addRangeConstraint({ constraintName: "range1", min: 0, max: 100 });
  gpkg.addEnumConstraint({ constraintName: "enum1", value: "a" });
  gpkg.addGlobConstraint({ constraintName: "glob1", value: "*" });

  const names = gpkg.listConstraintNames();
  assertEquals(names.length, 3);
  assertEquals(names.includes("range1"), true);
  assertEquals(names.includes("enum1"), true);
  assertEquals(names.includes("glob1"), true);

  gpkg.close();
});

// ============== Validation ==============

Deno.test("Schema - Validate value against range constraint", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addRangeConstraint({
    constraintName: "percent",
    min: 0,
    max: 100,
  });

  // Valid values
  assertEquals(gpkg.validateValueAgainstConstraint("percent", 0), true);
  assertEquals(gpkg.validateValueAgainstConstraint("percent", 50), true);
  assertEquals(gpkg.validateValueAgainstConstraint("percent", 100), true);

  // Invalid values
  assertThrows(
    () => gpkg.validateValueAgainstConstraint("percent", -1),
    Error,
    "less than minimum",
  );

  assertThrows(
    () => gpkg.validateValueAgainstConstraint("percent", 101),
    Error,
    "greater than maximum",
  );

  gpkg.close();
});

Deno.test("Schema - Validate value against exclusive range", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addRangeConstraint({
    constraintName: "exclusive",
    min: 0,
    minIsInclusive: false,
    max: 10,
    maxIsInclusive: false,
  });

  // Valid values
  assertEquals(gpkg.validateValueAgainstConstraint("exclusive", 0.1), true);
  assertEquals(gpkg.validateValueAgainstConstraint("exclusive", 5), true);
  assertEquals(gpkg.validateValueAgainstConstraint("exclusive", 9.9), true);

  // Invalid - boundary values not allowed
  assertThrows(
    () => gpkg.validateValueAgainstConstraint("exclusive", 0),
    Error,
    "must be greater than",
  );

  assertThrows(
    () => gpkg.validateValueAgainstConstraint("exclusive", 10),
    Error,
    "must be less than",
  );

  gpkg.close();
});

Deno.test("Schema - Validate value against enum constraint", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addEnumConstraint({ constraintName: "colors", value: "red" });
  gpkg.addEnumConstraint({ constraintName: "colors", value: "green" });
  gpkg.addEnumConstraint({ constraintName: "colors", value: "blue" });

  // Valid values
  assertEquals(gpkg.validateValueAgainstConstraint("colors", "red"), true);
  assertEquals(gpkg.validateValueAgainstConstraint("colors", "green"), true);
  assertEquals(gpkg.validateValueAgainstConstraint("colors", "blue"), true);

  // Invalid value
  assertThrows(
    () => gpkg.validateValueAgainstConstraint("colors", "yellow"),
    Error,
    "not in allowed values",
  );

  gpkg.close();
});

Deno.test("Schema - Validate value against glob constraint", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addGlobConstraint({
    constraintName: "phone",
    value: "???-???-????",
  });

  // Valid values
  assertEquals(
    gpkg.validateValueAgainstConstraint("phone", "123-456-7890"),
    true,
  );
  assertEquals(
    gpkg.validateValueAgainstConstraint("phone", "000-000-0000"),
    true,
  );

  // Invalid values
  assertThrows(
    () => gpkg.validateValueAgainstConstraint("phone", "12-345-6789"),
    Error,
    "does not match pattern",
  );

  assertThrows(
    () => gpkg.validateValueAgainstConstraint("phone", "1234567890"),
    Error,
    "does not match pattern",
  );

  gpkg.close();
});

Deno.test("Schema - Validate with wildcard glob", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addGlobConstraint({
    constraintName: "prefix",
    value: "ID-*",
  });

  // Valid values
  assertEquals(gpkg.validateValueAgainstConstraint("prefix", "ID-123"), true);
  assertEquals(
    gpkg.validateValueAgainstConstraint("prefix", "ID-abc-xyz"),
    true,
  );
  assertEquals(gpkg.validateValueAgainstConstraint("prefix", "ID-"), true);

  // Invalid values
  assertThrows(
    () => gpkg.validateValueAgainstConstraint("prefix", "id-123"),
    Error,
    "does not match pattern",
  );

  assertThrows(
    () => gpkg.validateValueAgainstConstraint("prefix", "123-ID"),
    Error,
    "does not match pattern",
  );

  gpkg.close();
});

// ============== Extension Registration ==============

Deno.test("Schema - Extension registered when adding data column", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "ext_test",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "field", type: "TEXT" }],
  });

  gpkg.addDataColumn({
    tableName: "ext_test",
    columnName: "field",
    title: "Test Field",
  });

  // Check extension is registered
  const ext = gpkg.getExtension("gpkg_schema", "ext_test", "field");
  assertExists(ext);
  assertEquals(ext.scope, "read-write");

  gpkg.close();
});

// ============== Attribute Table Schema ==============

Deno.test("Schema - Works with attribute tables", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createAttributeTable({
    tableName: "settings",
    columns: [
      { name: "key", type: "TEXT" },
      { name: "value", type: "TEXT" },
    ],
  });

  gpkg.addDataColumn({
    tableName: "settings",
    columnName: "key",
    title: "Setting Key",
    description: "Unique identifier for the setting",
  });

  gpkg.addDataColumn({
    tableName: "settings",
    columnName: "value",
    title: "Setting Value",
    description: "The value of the setting",
  });

  const columns = gpkg.listDataColumns("settings");
  assertEquals(columns.length, 2);

  gpkg.close();
});

// ============== Edge Cases ==============

Deno.test("Schema - Empty string values in data column", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.createFeatureTable({
    tableName: "empty_test",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "field", type: "TEXT" }],
  });

  // Add with minimal properties
  gpkg.addDataColumn({
    tableName: "empty_test",
    columnName: "field",
  });

  const col = gpkg.getDataColumn("empty_test", "field");
  assertExists(col);
  assertEquals(col.name, undefined);
  assertEquals(col.title, undefined);
  assertEquals(col.description, undefined);

  gpkg.close();
});

Deno.test("Schema - Negative range values", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addRangeConstraint({
    constraintName: "temperature",
    min: -273.15,
    max: 1000,
    description: "Temperature in Celsius",
  });

  assertEquals(gpkg.validateValueAgainstConstraint("temperature", -100), true);
  assertEquals(
    gpkg.validateValueAgainstConstraint("temperature", -273.15),
    true,
  );

  assertThrows(
    () => gpkg.validateValueAgainstConstraint("temperature", -300),
    Error,
    "less than minimum",
  );

  gpkg.close();
});

Deno.test("Schema - Decimal range values", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addRangeConstraint({
    constraintName: "latitude",
    min: -90.0,
    max: 90.0,
  });

  assertEquals(gpkg.validateValueAgainstConstraint("latitude", 45.5), true);
  assertEquals(gpkg.validateValueAgainstConstraint("latitude", -89.999), true);

  gpkg.close();
});

Deno.test("Schema - Update data column to add constraint", () => {
  const gpkg = new GeoPackage(":memory:");

  // Create constraint
  gpkg.addEnumConstraint({ constraintName: "level", value: "low" });
  gpkg.addEnumConstraint({ constraintName: "level", value: "high" });

  gpkg.createFeatureTable({
    tableName: "update_test",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "priority", type: "TEXT" }],
  });

  // Add without constraint
  gpkg.addDataColumn({
    tableName: "update_test",
    columnName: "priority",
    title: "Priority",
  });

  // Update to add constraint
  gpkg.updateDataColumn({
    tableName: "update_test",
    columnName: "priority",
    title: "Priority",
    constraintName: "level",
  });

  const col = gpkg.getDataColumn("update_test", "priority");
  assertExists(col);
  assertEquals(col.constraintName, "level");

  gpkg.close();
});

Deno.test("Schema - Update data column to remove constraint", () => {
  const gpkg = new GeoPackage(":memory:");

  gpkg.addEnumConstraint({ constraintName: "removable", value: "x" });

  gpkg.createFeatureTable({
    tableName: "remove_test",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "field", type: "TEXT" }],
  });

  gpkg.addDataColumn({
    tableName: "remove_test",
    columnName: "field",
    constraintName: "removable",
  });

  // Update to remove constraint
  gpkg.updateDataColumn({
    tableName: "remove_test",
    columnName: "field",
    title: "Field without constraint",
    // constraintName not specified = removed
  });

  const col = gpkg.getDataColumn("remove_test", "field");
  assertExists(col);
  assertEquals(col.constraintName, undefined);

  // Now we can delete the constraint since it's not in use
  gpkg.deleteConstraint("removable");

  gpkg.close();
});
