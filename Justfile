# Justfile for gpkg project

# List all available recipes
default:
    @just --list

# Install dependencies
install:
    deno cache --reload mod.ts

# Run all tests
test:
    deno test --allow-read --allow-write --allow-env --allow-ffi tests/

# Run tests with coverage
test-coverage:
    deno test --allow-read --allow-write --allow-env --allow-ffi --coverage=coverage tests/
    deno coverage coverage

# Run specific test file
test-file file:
    deno test --allow-read --allow-write --allow-env --allow-ffi {{file}}

# Format code
fmt:
    deno fmt

# Check formatting
fmt-check:
    deno fmt --check

# Lint code
lint:
    deno lint

# Type check
check:
    deno check mod.ts

# Run all checks (fmt, lint, type check)
verify: fmt-check lint check

# Build documentation
docs:
    deno doc --html --name="gpkg" mod.ts

# Clean generated files
clean:
    rm -rf coverage/
    rm -rf .deno/
    rm -rf docs/generated/

# Publish to JSR (dry run)
publish-dry:
    deno publish --dry-run

# Publish to JSR
publish:
    deno publish

# Run example
example name:
    deno run --allow-read --allow-write --allow-env --allow-ffi examples/{{name}}.ts

# Development mode - watch and run tests
dev:
    deno test --allow-read --allow-write --allow-env --allow-ffi --watch tests/

# Benchmark
bench:
    deno bench --allow-read --allow-write --allow-env --allow-ffi tests/bench/
