/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("path");

// Ensure node is findable by child processes (Turbopack needs this)
const nodeDir = path.dirname(process.execPath);
process.env.PATH = nodeDir + ":" + (process.env.PATH || "");

process.chdir(__dirname);
process.argv = [process.argv[0], "dev"];
require(path.join(__dirname, "node_modules/next/dist/bin/next"));
