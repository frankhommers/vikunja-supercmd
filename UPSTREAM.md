# Upstream provenance

This is a standalone source fork of `extensions/vikunja` from
[raycast/extensions](https://github.com/raycast/extensions/tree/3c654737b0d566d3103fcdf72221a9f34664bdf2/extensions/vikunja).
It is not a fork of the entire extensions monorepo in GitHub's fork network.

- Imported revision: `3c654737b0d566d3103fcdf72221a9f34664bdf2` (latest change to this extension when imported on 2026-11-11).
- Original requested revision: `e73f3bcea01bc691dbfc04b10aea746ee05da257`.
- Original author: flexorflex; contributor: strikerlulu.
- License: MIT; the upstream root LICENSE is included.
- Server compatibility reference: [Vikunja v2.8.0 source](https://github.com/go-vikunja/vikunja/tree/v2.8.0/pkg/routes/api/v2).
- SuperCmd build reference: [extension runner](https://github.com/SuperCmdLabs/SuperCmd/blob/main/src/main/extension-runner.ts).

The first commit contains the upstream snapshot. Later commits contain this fork's changes.
To refresh, compare the upstream extension directory with that baseline and merge
changes into this fork, preserving the API adapter and SuperCmd build. Run `npm run check`.
