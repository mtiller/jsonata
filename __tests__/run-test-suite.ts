/**
 * © Copyright IBM Corp. 2016 All Rights Reserved
 *   Project name: JSONata
 *   This project is licensed under the MIT License, see LICENSE
 */

"use strict";

var fs = require("fs");
var path = require("path");
import { jsonata, JEnv, eval2, timeboxExpression, EvaluationOptions } from "../src";

let tsDir = path.join(__dirname, process.env["JSONATA_TESTSUITE"] || "test-suite");
let groupDir = path.join(tsDir, process.env["JSONATA_GROUPS"] || "groups");
let datasetDir = path.join(tsDir, process.env["JSONATA_DATASETS"] || "datasets");
let groups = fs.readdirSync(groupDir).filter(name => !name.endsWith(".json"));

/**
 * Simple function to read in JSON
 * @param {string} dir - Directory containing JSON file
 * @param {string} file - Name of JSON file (relative to directory)
 * @returns {Object} Parsed JSON object
 */
function readJSON(dir, file) {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir, file)).toString());
    } catch (e) {
        throw new Error("Error reading " + file + " in " + dir + ": " + e.message);
    }
}

let datasets = {};
let datasetnames = fs.readdirSync(datasetDir);

datasetnames.forEach(name => {
    datasets[name.replace(".json", "")] = readJSON(datasetDir, name);
});

const test2 = process.env.hasOwnProperty("JSONATA_SKIP_EVAL2") ? false : true;

const evalOptions: EvaluationOptions = { legacyMode: true };

// This is the start of the set of tests associated with the test cases
// found in the test-suite directory.
describe("JSONata Test Suite", () => {
    // Iterate over all groups of tests
    groups.forEach(group => {
        let casenames = fs.readdirSync(path.join(groupDir, group));
        // Read JSON file containing all cases for this group
        let cases = casenames.map(name => readJSON(path.join(groupDir, group), name));
        describe("Group: " + group, () => {
            // Iterate over all cases
            for (let i = 0; i < cases.length; i++) {
                // Extract the current test case of interest
                let testcase = cases[i];
                let env = new JEnv(evalOptions);
                env.merge(testcase.bindings || {});
                let run = testcase.skip ? test.skip : testcase.only ? test.only : test;

                // Create a test based on the data in this testcase
                run(casenames[i] + ": " + testcase.expr, function() {
                    var expr;
                    // Start by trying to compile the expression associated with this test case
                    try {
                        expr = jsonata(testcase.expr);
                        // If there is a timelimit and depth limit for this case, use the
                        // `timeboxExpression` function to limit evaluation
                        if ("timelimit" in testcase && "depth" in testcase) {
                            jest.setTimeout(testcase.timelimit * 2);
                            timeboxExpression(expr, testcase.timelimit, testcase.depth);
                        }
                    } catch (e) {
                        // If we get here, an error was thrown.  So check to see if this particular
                        // testcase expects an exception (as indicated by the presence of the
                        // `code` field in the testcase)
                        if (testcase.code) {
                            // See if we go the code we expected
                            expect({ msg: e.message, code: e.code }).toEqual({ msg: e.message, code: testcase.code });
                            expect(e.code).toEqual(testcase.code);
                            // If a token was specified, check for that too
                            if (testcase.hasOwnProperty("token")) {
                                expect({ msg: e.message, code: e.code }).toEqual({
                                    msg: e.message,
                                    code: testcase.code,
                                });
                                expect(e.code).toEqual(testcase.token);
                            }
                        } else {
                            // If we get here, something went wrong because an exception
                            // was thrown when we didn't expect one to be thrown.
                            throw new Error("Got an unexpected exception: " + e.message);
                        }
                    }
                    // If we managed to compile the expression...
                    if (expr) {
                        // Load the input data set.  First, check to see if the test case defines its own input
                        // data (testcase.data).  If not, then look for a dataset number.  If it is -1, then that
                        // means there is no data (so use undefined).  If there is a dataset number, look up the
                        // input data in the datasets array.
                        let dataset = resolveDataset(datasets, testcase);
                        // let env = new JEnv();
                        // env.merge(testcase.bindings);

                        // Test cases have three possible outcomes from evaluation...
                        if ("undefinedResult" in testcase) {
                            // First is that we have an undefined result.  So, check
                            // to see if the result we get from evaluation is undefined
                            let result = expr.evaluate(dataset, testcase.bindings);
                            expect(result).toBeUndefined();

                            if (test2) {
                                let res2 = eval2(expr.ast(), dataset, env, evalOptions);
                                expect(res2).toBeUndefined();
                            }
                        } else if ("result" in testcase) {
                            // Second is that a (defined) result was provided.  In this case,
                            // we do a deep equality check against the expected result.
                            let result = expr.evaluate(dataset, testcase.bindings);
                            if (
                                result !== null &&
                                typeof result === "object" &&
                                result.hasOwnProperty("keepSingleton")
                            ) {
                                // If the result was tagged with the keepSingleton
                                // property, remove it so we can get an accurate comparison
                                delete result["keepSingleton"];
                            }
                            expect(result).toEqual(testcase.result);

                            if (test2) {
                                let res2 = eval2(expr.ast(), dataset, env, evalOptions);
                                //let res2 = eval2(expr.ast(), dataset, env);
                                expect(res2).toEqual(testcase.result);
                            }
                        } else if ("code" in testcase) {
                            // Finally, if a `code` field was specified, we expected the
                            // evaluation to fail and include the specified code in the
                            // thrown exception.
                            let error = false;
                            try {
                                expr.evaluate(dataset, testcase.bindings);
                            } catch (e) {
                                expect({ msg: e.message, code: e.code }).toEqual({
                                    msg: e.message,
                                    code: testcase.code,
                                });
                                expect(e.code).toEqual(testcase.code);
                                error = true;
                            }

                            if (test2) {
                                error = false;
                                try {
                                    let res2 = eval2(expr.ast(), dataset, env, { legacyMode: true });
                                    expect(res2).toBeUndefined();
                                } catch (e) {
                                    expect({ msg: e.message, code: e.code }).toEqual({
                                        msg: e.message,
                                        code: testcase.code,
                                    });
                                    expect(e.code).toEqual(testcase.code);
                                    error = true;
                                }
                            }
                            // If this is thrown, it is because we expected an error to be
                            // thrown but it wasn't.
                            expect(error).toBeTruthy();
                        } else {
                            // If we get here, it means there is something wrong with
                            // the test case data because there was nothing to check.
                            throw new Error("Nothing to test in this test case");
                        }
                    }
                });
            }
        });
    });
});

/**
 * Based on the collection of datasets and the information provided as part of the testcase,
 * determine what input data to use in the case (may return undefined).
 *
 * @param {Object} datasets Object mapping dataset names to JS values
 * @param {Object} testcase Testcase data read from testcase file
 * @returns {any} The input data to use when evaluating the jsonata expression
 */
function resolveDataset(datasets, testcase) {
    if ("data" in testcase) {
        return testcase.data;
    }
    if (testcase.dataset === null) {
        return undefined;
    }
    if (datasets.hasOwnProperty(testcase.dataset)) {
        return datasets[testcase.dataset];
    }
    throw new Error(
        "Unable to find dataset " +
            testcase.dataset +
            " among known datasets, are you sure the datasets directory has a file named " +
            testcase.dataset +
            ".json?",
    );
}

describe("This is a jest test", () => {
    test("An actual test", async () => {
        return 5;
    });
});
