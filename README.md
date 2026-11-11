# Vikunja for SuperCmd / Raycast

A standalone fork of the [Raycast Vikunja extension](https://github.com/raycast/extensions/tree/main/extensions/vikunja), updated for **Vikunja 2.8.0** and packaged for SuperCmd. Original author: flexorflex; contributor: strikerlulu. See [UPSTREAM.md](UPSTREAM.md) for the exact imported revision and MIT attribution.

## Features

- Create, search, edit, complete, move, and delete tasks.
- Browse and manage projects, labels, priorities, due dates, and favorites.
- Use Vikunja's API v2 (default), with Markdown descriptions and partial updates.
- Select API v1 for older servers.
- Fetch every page of tasks, projects, and labels instead of only the first page.

## Build

Requires Node.js 22.12+ (Node.js 24 recommended) and npm.

```sh
npm ci
npm run check
```

This builds the Raycast commands, checks TypeScript and lint, runs API regression tests,
and creates **`dist/vikunja-supercmd.tar.gz`**. The archive contains the manifest,
assets, `.sc-build` commands, metadata, license, and documentation.

`npm run build:supercmd` builds only the SuperCmd archive. The build follows
SuperCmd's CommonJS bundle format and leaves Raycast/React imports for its runtime.

## Install in SuperCmd

This custom fork is not in SuperCmd's extension catalog. Download a release bundle
or build it above, quit SuperCmd, and extract it into its extensions directory.
For the native SuperCmd 2.0 installation on macOS:

```sh
mkdir -p "$HOME/Library/Application Support/com.supercmd.SuperCmd/Extensions"
tar -xzf dist/vikunja-supercmd.tar.gz \
  -C "$HOME/Library/Application Support/com.supercmd.SuperCmd/Extensions"
```

For the Electron SuperCmdLabs build, the directory is instead
`~/Library/Application Support/SuperCmd/extensions`.

Restart SuperCmd and find **Vikunja Task Manager (Fork)**. The extension ID is
`vikunja-supercmd`; it can coexist with the catalog's `vikunja` extension and has
separate preferences. Configure:

- **Vikunja URL**: your instance URL, including any deployment subpath. A trailing `/api/v1` or `/api/v2` is also accepted and stripped; the version setting controls which API is used.
- **API Token**: create it in Vikunja → Settings → API Tokens. Grant the task, project, label, and task-label operations you intend to use. Partial updates may also require read permissions.
- **Vikunja API Version**: **v2** for Vikunja 2.8+, **v1** for older servers. There is no automatic fallback that retries write operations against another API.
- **Default Project**: project ID, `all`, or leave blank.

On Vikunja 2.8+, deleted tasks/projects can be restored using Vikunja's own trash UI.

## Raycast development

Run `npm run dev` on macOS with Raycast installed. The original four command names
are preserved. Store publishing is intentionally not configured for this standalone fork.

## Validation and limits

API behavior is checked against the Vikunja 2.8.0 server source, with regression
tests for request methods, pagination, search, empty responses, URL handling, and
legacy API support. TypeScript, ESLint, Raycast compilation, and SuperCmd bundling
are checked locally and by CI. The custom extension has not yet been exercised
inside SuperCmd against a live authenticated Vikunja instance.

The development-only minimatch dependency is overridden to a patched release;
this does not change the extension's runtime dependencies.
