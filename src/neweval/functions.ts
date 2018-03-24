// import { apply } from "./apply";
// import { EvaluationOptions } from "./options";
import { createSequence } from "../utils";
import { apply } from "../evaluate";
import { functionBoolean } from "../functions";

/**
 * Match a string with a regex returning an array of object containing details of each match
 * @param {String} str - string
 * @param {String} pattern - the substring/regex applied to the string
 * @param {String} replacement - text to replace the matched substrings
 * @param {Integer} [limit] - max number of matches to return
 * @returns {Array} The array of match objects
 */
export function functionReplace(str, pattern, replacement, limit) {
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
                    var replacedWith = apply(replacer, [matches], null);
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
}

/**
 * Create a map from an array of arguments
 * @param {Array} [arr] - array to map over
 * @param {Function} func - function to apply
 * @returns {Array} Map array
 */
export function functionMap(arr, func) {
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
        var res = apply(func, func_args, null);
        if (typeof res !== "undefined") {
            result.push(res);
        }
    }

    return result;
}

// This generator function does not have a yield(), presumably to make it
// consistent with other similar functions.
/**
 * Create a map from an array of arguments
 * @param {Array} [arr] - array to filter
 * @param {Function} func - predicate function
 * @returns {Array} Map array
 */
export function functionFilter(arr, func) {
    // eslint-disable-line require-yield
    // undefined inputs always return undefined
    if (typeof arr === "undefined") {
        return undefined;
    }

    var result = createSequence();

    var predicate = function(value, index, array) {
        var it = apply(func, [value, index, array], null);
        // returns a generator - so iterate over it
        var res = it.next();
        while (!res.done) {
            res = it.next(res.value);
        }
        return res.value;
    };

    for (var i = 0; i < arr.length; i++) {
        var entry = arr[i];
        if (functionBoolean(predicate(entry, i, arr))) {
            result.push(entry);
        }
    }

    return result;
}

/**
 * Fold left function
 * @param {Array} sequence - Sequence
 * @param {Function} func - Function
 * @param {Object} init - Initial value
 * @returns {*} Result
 */
export function functionFoldLeft(sequence, func, init) {
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
        result = apply(func, [result, sequence[index]], null);
        index++;
    }

    return result;
}

/**
 *
 * @param {*} obj - the input object to iterate over
 * @param {*} func - the function to apply to each key/value pair
 * @returns {Array} - the resultant array
 */
export function functionEach(obj, func) {
    var result = createSequence();

    for (var key in obj) {
        var func_args = [obj[key], key];
        // invoke func
        result.push(apply(func, func_args, null));
    }

    return result;
}
