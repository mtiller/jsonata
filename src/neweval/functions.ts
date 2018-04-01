// import { apply } from "./apply";
// import { EvaluationOptions } from "./options";
import { createSequence } from "../utils";
import { apply } from "./apply";
import { functionBoolean } from "../functions";
import * as errors from "../errors";
import { FunctionDetails, ProcedureDetails } from "./procs";
import { boxValue, fragmentBox, boxFunction, unbox, boxLambda } from "./box";
import { EvaluationOptions } from "./options";

function applySurrogate(func: Function | ProcedureDetails, args: Array<any>, context: any, options: EvaluationOptions) {
    let boxedArgs = fragmentBox(boxValue(args));
    let boxedContext = boxValue(context);
    if (typeof func === "function") {
        let f: FunctionDetails = {
            implementation: func,
            signature: undefined,
        };
        let result = apply(boxFunction(f), boxedArgs, boxedContext, options);
        return unbox(result);
    } else {
        let result = apply(boxLambda(func), boxedArgs, boxedContext, options);
        return unbox(result);
    }
}

/**
 * Match a string with a regex returning an array of object containing details of each match
 * @param {String} str - string
 * @param {String} pattern - the substring/regex applied to the string
 * @param {String} replacement - text to replace the matched substrings
 * @param {Integer} [limit] - max number of matches to return
 * @returns {Array} The array of match objects
 */
export function functionReplace(options: EvaluationOptions) {
    return (str, pattern, replacement, limit) => {
        // undefined inputs always return undefined
        if (typeof str === "undefined") {
            return undefined;
        }

        // pattern cannot be an empty string
        if (pattern === "") {
            throw {
                code: "D3010",
                stack: new Error().stack,
                value: pattern,
                index: 2,
            };
        }

        // limit, if specified, must be a non-negative number
        if (limit < 0) {
            throw {
                code: "D3011",
                stack: new Error().stack,
                value: limit,
                index: 4,
            };
        }

        var replacer;
        if (typeof replacement === "string") {
            replacer = function(regexMatch) {
                var substitute = "";
                // scan forward, copying the replacement text into the substitute string
                // and replace any occurrence of $n with the values matched by the regex
                var position = 0;
                var index = replacement.indexOf("$", position);
                while (index !== -1 && position < replacement.length) {
                    substitute += replacement.substring(position, index);
                    position = index + 1;
                    var dollarVal = replacement.charAt(position);
                    if (dollarVal === "$") {
                        // literal $
                        substitute += "$";
                        position++;
                    } else if (dollarVal === "0") {
                        substitute += regexMatch.match;
                        position++;
                    } else {
                        var maxDigits;
                        if (regexMatch.groups.length === 0) {
                            // no sub-matches; any $ followed by a digit will be replaced by an empty string
                            maxDigits = 1;
                        } else {
                            // max number of digits to parse following the $
                            maxDigits = Math.floor(Math.log(regexMatch.groups.length) * Math.LOG10E) + 1;
                        }
                        index = parseInt(replacement.substring(position, position + maxDigits), 10);
                        if (maxDigits > 1 && index > regexMatch.groups.length) {
                            index = parseInt(replacement.substring(position, position + maxDigits - 1), 10);
                        }
                        if (!isNaN(index)) {
                            if (regexMatch.groups.length > 0) {
                                var submatch = regexMatch.groups[index - 1];
                                if (typeof submatch !== "undefined") {
                                    substitute += submatch;
                                }
                            }
                            position += index.toString().length;
                        } else {
                            // not a capture group, treat the $ as literal
                            substitute += "$";
                        }
                    }
                    index = replacement.indexOf("$", position);
                }
                substitute += replacement.substring(position);
                return substitute;
            };
        } else {
            replacer = replacement;
        }

        var result = "";
        var position = 0;

        if (typeof limit === "undefined" || limit > 0) {
            var count = 0;
            if (typeof pattern === "string") {
                var index = str.indexOf(pattern, position);
                while (index !== -1 && (typeof limit === "undefined" || count < limit)) {
                    result += str.substring(position, index);
                    result += replacement;
                    position = index + pattern.length;
                    count++;
                    index = str.indexOf(pattern, position);
                }
                result += str.substring(position);
            } else {
                var matches = pattern(str);
                if (typeof matches !== "undefined") {
                    while (typeof matches !== "undefined" && (typeof limit === "undefined" || count < limit)) {
                        result += str.substring(position, matches.start);
                        var replacedWith = applySurrogate(replacer, [matches], null, options);
                        // check replacedWith is a string
                        if (typeof replacedWith === "string") {
                            result += replacedWith;
                        } else {
                            // not a string - throw error
                            throw {
                                code: "D3012",
                                stack: new Error().stack,
                                value: replacedWith,
                            };
                        }
                        position = matches.start + matches.match.length;
                        count++;
                        matches = matches.next();
                    }
                    result += str.substring(position);
                } else {
                    result = str;
                }
            }
        } else {
            result = str;
        }

        return result;
    };
}

/**
 * Create a map from an array of arguments
 * @param {Array} [arr] - array to map over
 * @param {Function} func - function to apply
 * @returns {Array} Map array
 */
export function functionMap(options: EvaluationOptions) {
    return (arr, func) => {
        // undefined inputs always return undefined
        if (typeof arr === "undefined") {
            return undefined;
        }

        var result = createSequence();
        // do the map - iterate over the arrays, and invoke func
        for (var i = 0; i < arr.length; i++) {
            var func_args = [arr[i]]; // the first arg (value) is required
            // the other two are optional - only supply it if the function can take it
            var length =
                typeof func === "function"
                    ? func.length
                    : func._jsonata_function === true ? func.implementation.length : func.arguments.length;
            if (length >= 2) {
                func_args.push(i);
            }
            if (length >= 3) {
                func_args.push(arr);
            }
            // invoke func
            var res = applySurrogate(func, func_args, null, options);
            if (typeof res !== "undefined") {
                result.push(res);
            }
        }

        return result;
    };
}

// This generator function does not have a yield(), presumably to make it
// consistent with other similar functions.
/**
 * Create a map from an array of arguments
 * @param {Array} [arr] - array to filter
 * @param {Function} func - predicate function
 * @returns {Array} Map array
 */
export function functionFilter(options: EvaluationOptions) {
    return (arr, func) => {
        // eslint-disable-line require-yield
        // undefined inputs always return undefined
        if (typeof arr === "undefined") {
            return undefined;
        }

        var result = createSequence();

        var predicate = function(value, index, array) {
            var it = applySurrogate(func, [value, index, array], null, options);
            return it;
            // // returns a generator - so iterate over it
            // var res = it.next();
            // while (!res.done) {
            //     res = it.next(res.value);
            // }
            // return res.value;
        };

        for (var i = 0; i < arr.length; i++) {
            var entry = arr[i];
            if (functionBoolean(predicate(entry, i, arr))) {
                result.push(entry);
            }
        }

        return result;
    };
}

/**
 * Fold left function
 * @param {Array} sequence - Sequence
 * @param {Function} func - Function
 * @param {Object} init - Initial value
 * @returns {*} Result
 */
export function functionFoldLeft(options: EvaluationOptions) {
    return (sequence, func, init) => {
        // undefined inputs always return undefined
        if (typeof sequence === "undefined") {
            return undefined;
        }

        var result;

        if (
            !(
                func.length === 2 ||
                (func._jsonata_function === true && func.implementation.length === 2) ||
                func.arguments.length === 2
            )
        ) {
            throw {
                stack: new Error().stack,
                code: "D3050",
                index: 1,
            };
        }

        var index;
        if (typeof init === "undefined" && sequence.length > 0) {
            result = sequence[0];
            index = 1;
        } else {
            result = init;
            index = 0;
        }

        while (index < sequence.length) {
            result = applySurrogate(func, [result, sequence[index]], null, options);
            index++;
        }

        return result;
    };
}

/**
 *
 * @param {*} obj - the input object to iterate over
 * @param {*} func - the function to apply to each key/value pair
 * @returns {Array} - the resultant array
 */
export function functionEach(options: EvaluationOptions) {
    return (obj, func) => {
        var result = createSequence();

        for (var key in obj) {
            var func_args = [obj[key], key];
            // invoke func
            result.push(applySurrogate(func, func_args, null, options));
        }

        return result;
    };
}

/**
 * Split a string into an array of substrings
 * @param {String} str - string
 * @param {String} separator - the token or regex that splits the string
 * @param {Integer} [limit] - max number of substrings
 * @returns {Array} The array of string
 */
export function functionSplit(str: string, separator: any, limit?: number): string[] {
    // undefined inputs always return undefined
    if (typeof str === "undefined") {
        return undefined;
    }

    // limit, if specified, must be a non-negative number
    if (limit < 0) {
        throw errors.error({
            code: "D3020",
        });
    }

    // limit = typeof limit === "undefined" ? Infinity : limit;

    if (separator instanceof RegExp) {
        return str.split(separator, limit);
    } else if (typeof separator === "string") {
        return str.split(separator, limit);
    } else {
        throw new Error("Expected argument to be a string or regexp");
    }
}

/**
 * Tests if the str contains the token
 * @param {String} str - string to test
 * @param {String} token - substring or regex to find
 * @returns {Boolean} - true if str contains token
 */
export function functionContains(str: string, token: string | RegExp) {
    // undefined inputs always return undefined
    if (typeof str === "undefined") {
        return undefined;
    }

    if (typeof token === "string") {
        return str.indexOf(token) >= 0;
    }
    if (token instanceof RegExp) {
        return str.match(token);
    } else {
        throw new Error("Expected argument to be string or regexp");
    }
}

/**
 * Match a string with a regex returning an array of object containing details of each match
 * @param {String} str - string
 * @param {String} regex - the regex applied to the string
 * @param {Integer} [limit] - max number of matches to return
 * @returns {Array} The array of match objects
 */
export function functionMatch(str: string, regex: RegExp, limit?: number) {
    // undefined inputs always return undefined
    if (typeof str === "undefined") {
        return undefined;
    }

    // limit, if specified, must be a non-negative number
    if (limit < 0) {
        throw errors.error({
            code: "D3040",
        });
    }

    limit = limit === undefined ? Infinity : limit;

    let ret: any[] = [];
    if (typeof limit === "undefined" || limit > 0) {
        let count = 0;
        let match = regex.exec(str);
        while (match !== null && count < limit) {
            ret.push(match);
            count++;
        }
    }
    return ret;
    // var matches = regex.exec(str);
    // if (matches == null) return [];
    // let ret: Match[] = [];
    // while (typeof matches !== "undefined" && (typeof limit === "undefined" || count < limit)) {
    //     ret.push({
    //         match: matches.match,
    //         index: matches.start,
    //         groups: matches.groups,
    //     });
    //     matches = matches.next();
    //     count++;
    // }
    // return ret;
}
