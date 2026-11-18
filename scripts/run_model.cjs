"use strict";
require("../docs/model.js");
require("../docs/thermo.js");
const fs = require("node:fs");
const input = JSON.parse(fs.readFileSync(0, "utf8"));
const { evaluate, score } = globalThis.FuelPhysics;
const gas = evaluate({ ai95: 100 }, true);
const results = input.map(({ parts, reference = false, trace = false, step = 2 }) => {
  const result = evaluate(parts, reference, trace, step);
  return Object.assign(result, score(result, gas));
});
process.stdout.write(JSON.stringify(results));
