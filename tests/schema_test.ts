/**
 * Schema extension (gpkg_data_columns) unit tests.
 */

import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert";
import { GeoPackage } from "../mod.ts";

// ============== Data Column Definitions ==============

Deno.test("Schema - Add and get data column definition", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "cities",
    geometryType: "POINT",
    srsId: 4326,
    columns: [
      { name: "name", type: "TEXT" },
      { name: "population", type: "INTEGER" },
    ],
  });

  // Add data column definition
  await gpkg.addDataColumn({
    tableName: "cities",
    columnName: "name",
    name: "city_name",
    title: "City Name",
    description: "The official name of the city",
  });

  // Get data column definition
  const col = await gpkg.getDataColumn("cities", "name");
  assertExists(col);
  assertEquals(col.tableName, "cities");
  assertEquals(col.columnName, "name");
  assertEquals(col.name, "city_name");
  assertEquals(col.title, "City Name");
  assertEquals(col.description, "The official name of the city");

  await gpkg.close();
});

Deno.test("Schema - Add data column with mime type", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "documents",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "content", type: "BLOB" }],
  });

  await gpkg.addDataColumn({
    tableName: "documents",
    columnName: "content",
    title: "Document Content",
    mimeType: "application/pdf",
  });

  const col = await gpkg.getDataColumn("documents", "content");
  assertExists(col);
  assertEquals(col.mimeType, "application/pdf");

  await gpkg.close();
});

Deno.test("Schema - List data columns for table", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "places",
    geometryType: "POINT",
    srsId: 4326,
    columns: [
      { name: "name", type: "TEXT" },
      { name: "category", type: "TEXT" },
      { name: "rating", type: "REAL" },
    ],
  });

  await gpkg.addDataColumn({
    tableName: "places",
    columnName: "name",
    title: "Place Name",
  });

  await gpkg.addDataColumn({
    tableName: "places",
    columnName: "category",
    title: "Category",
  });

  await gpkg.addDataColumn({
    tableName: "places",
    columnName: "rating",
    title: "Rating",
  });

  const columns = await gpkg.listDataColumns("places");
  assertEquals(columns.length, 3);

  // Should be sorted by column name
  assertEquals(columns[0].columnName, "category");
  assertEquals(columns[1].columnName, "name");
  assertEquals(columns[2].columnName, "rating");

  await gpkg.close();
});

Deno.test("Schema - Update data column definition", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "items",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "status", type: "TEXT" }],
  });

  await gpkg.addDataColumn({
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

  const col = await gpkg.getDataColumn("items", "status");
  assertExists(col);
  assertEquals(col.title, "Current Status");
  assertEquals(col.description, "The current status of the item");

  await gpkg.close();
});

Deno.test("Schema - Delete data column definition", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "test_table",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "field", type: "TEXT" }],
  });

  await gpkg.addDataColumn({
    tableName: "test_table",
    columnName: "field",
    title: "Test Field",
  });

  // Verify it exists
  assertExists(await gpkg.getDataColumn("test_table", "field"));

  // Delete it
  gpkg.deleteDataColumn("test_table", "field");

  // Verify it's gone
  assertEquals(await gpkg.getDataColumn("test_table", "field"), undefined);

  await gpkg.close();
});

Deno.test("Schema - Cannot add duplicate data column definition", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "dup_test",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "field", type: "TEXT" }],
  });

  await gpkg.addDataColumn({
    tableName: "dup_test",
    columnName: "field",
    title: "First",
  });

  await assertRejects(
    async () => {
      await gpkg.addDataColumn({
        tableName: "dup_test",
        columnName: "field",
        title: "Second",
      });
    },
    Error,
    "already exists",
  );

  await gpkg.close();
});

Deno.test("Schema - Cannot add data column for non-existent table", async () => {
  const gpkg = await GeoPackage.memory();

  await assertRejects(
    async () => {
      await gpkg.addDataColumn({
        tableName: "nonexistent",
        columnName: "field",
        title: "Test",
      });
    },
    Error,
    "not found in gpkg_contents",
  );

  await gpkg.close();
});

// ============== Range Constraints ==============

Deno.test("Schema - Add and get range constraint", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addRangeConstraint({
    constraintType: "range",
    constraintName: "percent",
    min: 0,
    max: 100,
    description: "Percentage value between 0 and 100",
  });

  const constraint = await gpkg.getRangeConstraint("percent");
  assertExists(constraint);
  assertEquals(constraint.constraintType, "range");
  assertEquals(constraint.min, 0);
  assertEquals(constraint.max, 100);
  assertEquals(constraint.minIsInclusive, true);
  assertEquals(constraint.maxIsInclusive, true);
  assertEquals(constraint.description, "Percentage value between 0 and 100");

  await gpkg.close();
});

Deno.test("Schema - Range constraint with exclusive bounds", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addRangeConstraint({
    constraintType: "range",
    constraintName: "positive",
    min: 0,
    minIsInclusive: false,
    description: "Strictly positive numbers",
  });

  const constraint = await gpkg.getRangeConstraint("positive");
  assertExists(constraint);
  assertEquals(constraint.min, 0);
  assertEquals(constraint.minIsInclusive, false);
  assertEquals(constraint.max, undefined);

  await gpkg.close();
});

Deno.test("Schema - Range constraint min only", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addRangeConstraint({
    constraintType: "range",
    constraintName: "min_only",
    min: 10,
  });

  const constraint = await gpkg.getRangeConstraint("min_only");
  assertExists(constraint);
  assertEquals(constraint.min, 10);
  assertEquals(constraint.max, undefined);

  await gpkg.close();
});

Deno.test("Schema - Range constraint max only", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addRangeConstraint({
    constraintType: "range",
    constraintName: "max_only",
    max: 1000,
  });

  const constraint = await gpkg.getRangeConstraint("max_only");
  assertExists(constraint);
  assertEquals(constraint.min, undefined);
  assertEquals(constraint.max, 1000);

  await gpkg.close();
});

Deno.test("Schema - Range constraint must have min or max", async () => {
  const gpkg = await GeoPackage.memory();

  await assertRejects(
    async () => {
      await gpkg.addRangeConstraint({
        constraintType: "range",
        constraintName: "invalid",
      });
    },
    Error,
    "must have at least min or max",
  );

  await gpkg.close();
});

// ============== Enum Constraints ==============

Deno.test("Schema - Add enum constraint with multiple values", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addEnumConstraint({
    constraintType: "enum",
    constraintName: "status",
    value: "active",
  });

  await gpkg.addEnumConstraint({
    constraintType: "enum",
    constraintName: "status",
    value: "inactive",
  });

  await gpkg.addEnumConstraint({
    constraintType: "enum",
    constraintName: "status",
    value: "pending",
  });

  const values = await gpkg.getEnumValues("status");
  assertEquals(values.length, 3);
  assertEquals(values.includes("active"), true);
  assertEquals(values.includes("inactive"), true);
  assertEquals(values.includes("pending"), true);

  await gpkg.close();
});

Deno.test("Schema - Get constraints returns all entries", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addEnumConstraint({
    constraintType: "enum",
    constraintName: "priority",
    value: "low",
    description: "Low priority",
  });

  await gpkg.addEnumConstraint({
    constraintType: "enum",
    constraintName: "priority",
    value: "medium",
  });

  await gpkg.addEnumConstraint({
    constraintType: "enum",
    constraintName: "priority",
    value: "high",
  });

  const constraints = await gpkg.getConstraints("priority");
  assertEquals(constraints.length, 3);

  for (const c of constraints) {
    assertEquals(c.constraintType, "enum");
    assertEquals(c.constraintName, "priority");
  }

  await gpkg.close();
});

// ============== Glob Constraints ==============

Deno.test("Schema - Add glob constraint", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addGlobConstraint({
    constraintType: "glob",
    constraintName: "email_pattern",
    value: "*@*.*",
    description: "Simple email pattern",
  });

  const constraints = await gpkg.getConstraints("email_pattern");
  assertEquals(constraints.length, 1);
  assertEquals(constraints[0].constraintType, "glob");
  if (constraints[0].constraintType === "glob") {
    assertEquals(constraints[0].value, "*@*.*");
  }

  await gpkg.close();
});

// ============== Data Column with Constraint ==============

Deno.test("Schema - Data column with constraint reference", async () => {
  const gpkg = await GeoPackage.memory();

  // Create constraint first
  await gpkg.addEnumConstraint({
    constraintName: "yesno",
    constraintType: "enum",
    value: "yes",
  });
  await gpkg.addEnumConstraint({
    constraintName: "yesno",
    constraintType: "enum",
    value: "no",
  });

  await gpkg.createFeatureTable({
    tableName: "survey",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "response", type: "TEXT" }],
  });

  // Add data column with constraint
  await gpkg.addDataColumn({
    tableName: "survey",
    columnName: "response",
    title: "Survey Response",
    constraintName: "yesno",
  });

  const col = await gpkg.getDataColumn("survey", "response");
  assertExists(col);
  assertEquals(col.constraintName, "yesno");

  await gpkg.close();
});

Deno.test("Schema - Cannot add data column with non-existent constraint", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "test",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "field", type: "TEXT" }],
  });

  await assertRejects(
    async () => {
      await gpkg.addDataColumn({
        tableName: "test",
        columnName: "field",
        constraintName: "nonexistent",
      });
    },
    Error,
    "not found",
  );

  await gpkg.close();
});

// ============== Constraint Deletion ==============

Deno.test("Schema - Delete constraint", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addEnumConstraint({
    constraintName: "to_delete",
    constraintType: "enum",
    value: "a",
  });
  await gpkg.addEnumConstraint({
    constraintName: "to_delete",
    constraintType: "enum",
    value: "b",
  });

  // Verify exists
  assertEquals((await gpkg.getEnumValues("to_delete")).length, 2);

  // Delete
  await gpkg.deleteConstraint("to_delete");

  // Verify gone
  assertEquals((await gpkg.getConstraints("to_delete")).length, 0);

  await gpkg.close();
});

Deno.test("Schema - Cannot delete constraint in use", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addEnumConstraint({
    constraintName: "in_use",
    constraintType: "enum",
    value: "x",
  });

  await gpkg.createFeatureTable({
    tableName: "using_constraint",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "field", type: "TEXT" }],
  });

  await gpkg.addDataColumn({
    tableName: "using_constraint",
    columnName: "field",
    constraintName: "in_use",
  });

  await assertRejects(
    async () => {
      await gpkg.deleteConstraint("in_use");
    },
    Error,
    "referenced by",
  );

  await gpkg.close();
});

Deno.test("Schema - List all constraint names", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addRangeConstraint({
    constraintName: "range1",
    constraintType: "range",
    min: 0,
    max: 100,
  });
  await gpkg.addEnumConstraint({
    constraintName: "enum1",
    constraintType: "enum",
    value: "a",
  });
  await gpkg.addGlobConstraint({
    constraintName: "glob1",
    constraintType: "glob",
    value: "*",
  });

  const names = await gpkg.listConstraintNames();
  assertEquals(names.length, 3);
  assertEquals(names.includes("range1"), true);
  assertEquals(names.includes("enum1"), true);
  assertEquals(names.includes("glob1"), true);

  await gpkg.close();
});

// ============== Validation ==============

Deno.test("Schema - Validate value against range constraint", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addRangeConstraint({
    constraintType: "range",
    constraintName: "percent",
    min: 0,
    max: 100,
  });

  // Valid values
  assertEquals(await gpkg.validateValueAgainstConstraint("percent", 0), true);
  assertEquals(await gpkg.validateValueAgainstConstraint("percent", 50), true);
  assertEquals(await gpkg.validateValueAgainstConstraint("percent", 100), true);

  // Invalid values
  await assertRejects(
    async () => await gpkg.validateValueAgainstConstraint("percent", -1),
    Error,
    "less than minimum",
  );

  await assertRejects(
    async () => await gpkg.validateValueAgainstConstraint("percent", 101),
    Error,
    "greater than maximum",
  );

  await gpkg.close();
});

Deno.test("Schema - Validate value against exclusive range", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addRangeConstraint({
    constraintType: "range",
    constraintName: "exclusive",
    min: 0,
    minIsInclusive: false,
    max: 10,
    maxIsInclusive: false,
  });

  // Valid values
  assertEquals(
    await gpkg.validateValueAgainstConstraint("exclusive", 0.1),
    true,
  );
  assertEquals(await gpkg.validateValueAgainstConstraint("exclusive", 5), true);
  assertEquals(
    await gpkg.validateValueAgainstConstraint("exclusive", 9.9),
    true,
  );

  // Invalid - boundary values not allowed
  await assertRejects(
    async () => await gpkg.validateValueAgainstConstraint("exclusive", 0),
    Error,
    "must be greater than",
  );

  await assertRejects(
    async () => await gpkg.validateValueAgainstConstraint("exclusive", 10),
    Error,
    "must be less than",
  );

  await gpkg.close();
});

Deno.test("Schema - Validate value against enum constraint", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addEnumConstraint({
    constraintName: "colors",
    constraintType: "enum",
    value: "red",
  });
  await gpkg.addEnumConstraint({
    constraintName: "colors",
    constraintType: "enum",
    value: "green",
  });
  await gpkg.addEnumConstraint({
    constraintName: "colors",
    constraintType: "enum",
    value: "blue",
  });

  // Valid values
  assertEquals(
    await gpkg.validateValueAgainstConstraint("colors", "red"),
    true,
  );
  assertEquals(
    await gpkg.validateValueAgainstConstraint("colors", "green"),
    true,
  );
  assertEquals(
    await gpkg.validateValueAgainstConstraint("colors", "blue"),
    true,
  );

  // Invalid value
  await assertRejects(
    async () => await gpkg.validateValueAgainstConstraint("colors", "yellow"),
    Error,
    "not in allowed values",
  );

  await gpkg.close();
});

Deno.test("Schema - Validate value against glob constraint", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addGlobConstraint({
    constraintType: "glob",
    constraintName: "phone",
    value: "???-???-????",
  });

  // Valid values
  assertEquals(
    await gpkg.validateValueAgainstConstraint("phone", "123-456-7890"),
    true,
  );
  assertEquals(
    await gpkg.validateValueAgainstConstraint("phone", "000-000-0000"),
    true,
  );

  // Invalid values
  await assertRejects(
    async () =>
      await gpkg.validateValueAgainstConstraint("phone", "12-345-6789"),
    Error,
    "does not match pattern",
  );

  await assertRejects(
    async () =>
      await gpkg.validateValueAgainstConstraint("phone", "1234567890"),
    Error,
    "does not match pattern",
  );

  await gpkg.close();
});

Deno.test("Schema - Validate with wildcard glob", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addGlobConstraint({
    constraintType: "glob",
    constraintName: "prefix",
    value: "ID-*",
  });

  // Valid values
  assertEquals(
    await gpkg.validateValueAgainstConstraint("prefix", "ID-123"),
    true,
  );
  assertEquals(
    await gpkg.validateValueAgainstConstraint("prefix", "ID-abc-xyz"),
    true,
  );
  assertEquals(
    await gpkg.validateValueAgainstConstraint("prefix", "ID-"),
    true,
  );

  // Invalid values
  await assertRejects(
    async () => await gpkg.validateValueAgainstConstraint("prefix", "id-123"),
    Error,
    "does not match pattern",
  );

  await assertRejects(
    async () => await gpkg.validateValueAgainstConstraint("prefix", "123-ID"),
    Error,
    "does not match pattern",
  );

  await gpkg.close();
});

// ============== Extension Registration ==============

Deno.test("Schema - Extension registered when adding data column", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "ext_test",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "field", type: "TEXT" }],
  });

  await gpkg.addDataColumn({
    tableName: "ext_test",
    columnName: "field",
    title: "Test Field",
  });

  // Check extension is registered
  const ext = await gpkg.getExtension("gpkg_schema", "ext_test", "field");
  assertExists(ext);
  assertEquals(ext!.scope, "read-write");

  await gpkg.close();
});

// ============== Attribute Table Schema ==============

Deno.test("Schema - Works with attribute tables", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createAttributeTable({
    tableName: "settings",
    columns: [
      { name: "key", type: "TEXT" },
      { name: "value", type: "TEXT" },
    ],
  });

  await gpkg.addDataColumn({
    tableName: "settings",
    columnName: "key",
    title: "Setting Key",
    description: "Unique identifier for the setting",
  });

  await gpkg.addDataColumn({
    tableName: "settings",
    columnName: "value",
    title: "Setting Value",
    description: "The value of the setting",
  });

  const columns = await gpkg.listDataColumns("settings");
  assertEquals(columns.length, 2);

  await gpkg.close();
});

// ============== Edge Cases ==============

Deno.test("Schema - Empty string values in data column", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.createFeatureTable({
    tableName: "empty_test",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "field", type: "TEXT" }],
  });

  // Add with minimal properties
  await gpkg.addDataColumn({
    tableName: "empty_test",
    columnName: "field",
  });

  const col = await gpkg.getDataColumn("empty_test", "field");
  assertExists(col);
  assertEquals(col.name, undefined);
  assertEquals(col.title, undefined);
  assertEquals(col.description, undefined);

  await gpkg.close();
});

Deno.test("Schema - Negative range values", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addRangeConstraint({
    constraintType: "range",
    constraintName: "temperature",
    min: -273.15,
    max: 1000,
    description: "Temperature in Celsius",
  });

  assertEquals(
    await gpkg.validateValueAgainstConstraint("temperature", -100),
    true,
  );
  assertEquals(
    await gpkg.validateValueAgainstConstraint("temperature", -273.15),
    true,
  );

  await assertRejects(
    async () => await gpkg.validateValueAgainstConstraint("temperature", -300),
    Error,
    "less than minimum",
  );

  await gpkg.close();
});

Deno.test("Schema - Decimal range values", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addRangeConstraint({
    constraintType: "range",
    constraintName: "latitude",
    min: -90.0,
    max: 90.0,
  });

  assertEquals(
    await gpkg.validateValueAgainstConstraint("latitude", 45.5),
    true,
  );
  assertEquals(
    await gpkg.validateValueAgainstConstraint("latitude", -89.999),
    true,
  );

  await gpkg.close();
});

Deno.test("Schema - Update data column to add constraint", async () => {
  const gpkg = await GeoPackage.memory();

  // Create constraint
  await gpkg.addEnumConstraint({
    constraintName: "level",
    constraintType: "enum",
    value: "low",
  });
  await gpkg.addEnumConstraint({
    constraintName: "level",
    constraintType: "enum",
    value: "high",
  });

  await gpkg.createFeatureTable({
    tableName: "update_test",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "priority", type: "TEXT" }],
  });

  // Add without constraint
  await gpkg.addDataColumn({
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

  const col = await gpkg.getDataColumn("update_test", "priority");
  assertExists(col);
  assertEquals(col.constraintName, "level");

  await gpkg.close();
});

Deno.test("Schema - Update data column to remove constraint", async () => {
  const gpkg = await GeoPackage.memory();

  await gpkg.addEnumConstraint({
    constraintName: "removable",
    constraintType: "enum",
    value: "x",
  });

  await gpkg.createFeatureTable({
    tableName: "remove_test",
    geometryType: "POINT",
    srsId: 4326,
    columns: [{ name: "field", type: "TEXT" }],
  });

  await gpkg.addDataColumn({
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

  const col = await gpkg.getDataColumn("remove_test", "field");
  assertExists(col);
  assertEquals(col.constraintName, undefined);

  // Now we can delete the constraint since it's not in use
  gpkg.deleteConstraint("removable");

  await gpkg.close();
});
