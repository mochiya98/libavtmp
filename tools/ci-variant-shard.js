#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const shard = Number(process.argv[2]);
const shardCount = Number(process.argv[3]);
const buildType = process.env.BUILD_TYPE;
if (!Number.isInteger(shard) || !Number.isInteger(shardCount) || shardCount < 1 || shard < 0 || shard >= shardCount) {
    console.error("usage: ci-variant-shard.js SHARD SHARD_COUNT [EXCLUDED_VARIANT ...]");
    process.exit(2);
}
if (buildType !== undefined && buildType !== "release" && buildType !== "dbg") {
    console.error("BUILD_TYPE must be release or dbg");
    process.exit(2);
}
const excluded = new Set(process.argv.slice(4));

const root = path.resolve(__dirname, "..");
const configRoot = path.join(root, "configs", "configs");
const variants = fs.readdirSync(configRoot, {withFileTypes: true})
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !excluded.has(name))
    .sort();

function countMatches(file, re) {
    if (!fs.existsSync(file)) return 0;
    return (fs.readFileSync(file, "utf8").match(re) || []).length;
}

function weight(name) {
    const dir = path.join(configRoot, name);
    // Every FFmpeg configuration has a substantial fixed cost.  Add a smaller
    // variable cost for enabled components and third-party dependencies so the
    // greedy assignment does not put all large aggregate variants on one shard.
    return 40
        + countMatches(path.join(dir, "ffmpeg-config.txt"), /--enable-/g)
        + 8 * countMatches(path.join(dir, "deps.mk"), /^build\//gm);
}

const work = variants.map((name) => ({name, weight: weight(name)}))
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
const bins = Array.from({length: shardCount}, (_, index) => ({index, weight: 0, variants: []}));

for (const item of work) {
    bins.sort((a, b) => a.weight - b.weight || a.index - b.index);
    bins[0].variants.push(item.name);
    bins[0].weight += item.weight;
}

const selected = bins.find((bin) => bin.index === shard);
selected.variants.sort();
const targetPrefix = buildType === undefined ? "build" : `build-${buildType}`;
for (const name of selected.variants) process.stdout.write(`${targetPrefix}-${name}\n`);
