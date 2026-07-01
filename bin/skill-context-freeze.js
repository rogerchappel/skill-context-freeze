#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createFreezePacket, renderMarkdown } from "../src/index.js";

async function main(argv) {
  const [command, briefPath, ...rest] = argv;
  if (command !== "freeze" || !briefPath) {
    usage();
    process.exitCode = 1;
    return;
  }

  const options = parseArgs(rest);
  const markdown = await readFile(briefPath, "utf8");
  const metadata = options.metadata
    ? JSON.parse(await readFile(options.metadata, "utf8"))
    : {};
  const packet = createFreezePacket(markdown, { ...metadata, source: briefPath });

  process.stdout.write(options.json ? `${JSON.stringify(packet, null, 2)}\n` : renderMarkdown(packet));
}

function parseArgs(args) {
  const options = { json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--metadata") {
      options.metadata = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function usage() {
  process.stderr.write("Usage: skill-context-freeze freeze <brief.md> [--metadata metadata.json] [--json]\n");
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
