# packages/

This directory is reserved for shared packages that can be consumed by both `apps/api` and `apps/web`.

## Examples of what to put here

| Package | Description |
|---|---|
| `packages/types` | Shared TypeScript types / JSON schemas |
| `packages/shared-py` | Shared Python utilities (as a local uv package) |
| `packages/config` | Shared ESLint / TypeScript configs |

## Adding a shared TypeScript package

```bash
mkdir packages/my-package
cd packages/my-package
bun init
```

Then reference it in `apps/web/package.json`:

```json
{
  "dependencies": {
    "@repo/my-package": "workspace:*"
  }
}
```

## Adding a shared Python package

```bash
mkdir packages/my-py-package
cd packages/my-py-package
uv init --lib
```

Then add it to `apps/api/pyproject.toml`:

```toml
[tool.uv.sources]
my-py-package = { path = "../../packages/my-py-package", editable = true }
```
