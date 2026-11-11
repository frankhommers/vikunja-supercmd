import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
const stage = path.join(root, "dist", manifest.name);
await rm(stage, { recursive: true, force: true });
await mkdir(path.join(stage, ".sc-build"), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: manifest.commands.map(({ name }) => `src/${name}.tsx`),
  outdir: path.join(stage, ".sc-build"),
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "es2020",
  jsx: "automatic",
  external: ["@raycast/api", "@raycast/utils", "react", "react-dom"],
  define: { "process.env.NODE_ENV": '"production"', global: "globalThis" },
});
for (const file of [
  "package.json",
  "assets",
  "LICENSE",
  "README.md",
  "UPSTREAM.md",
]) {
  await cp(path.join(root, file), path.join(stage, file), { recursive: true });
}
await writeFile(
  path.join(stage, ".sc-meta.json"),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      prebuilt: true,
      commands: manifest.commands.map(({ name }) => name),
    },
    null,
    2,
  ) + "\n",
);
const archive = path.join(root, "dist", `${manifest.name}.tar.gz`);
execFileSync("tar", [
  "-czf",
  archive,
  "-C",
  path.join(root, "dist"),
  manifest.name,
]);
console.log(`SuperCmd bundle: ${archive}`);
