import { createFrame } from "./utils";
import { bindStandardFunctions } from './functions';
import { start } from "repl";
import { stat } from "fs";

export const operators = {
    ".": 75,
    "[": 80,
    "]": 0,
    "{": 70,
    "}": 0,
    "(": 80,
    ")": 0,
    ",": 0,
    "@": 75,
    "#": 70,
    ";": 80,
    ":": 80,
    "?": 20,
    "+": 50,
    "-": 50,
    "*": 60,
    "/": 60,
    "%": 60,
    "|": 20,
    "=": 40,
    "<": 40,
    ">": 40,
    "^": 40,
    "**": 60,
    "..": 20,
    ":=": 10,
    "!=": 40,
    "<=": 40,
    ">=": 40,
    "~>": 40,
    and: 30,
    or: 25,
    in: 40,
    "&": 50,
    "!": 0, // not an operator, but needed as a stop character for name tokens
    "~": 0, // not an operator, but needed as a stop character for name tokens
};

export const escapes = {
    // JSON string escape sequences - see json.org
    '"': '"',
    "\\": "\\",
    "/": "/",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
};

export const staticFrame = createFrame(null);
bindStandardFunctions(staticFrame);

/**
 * Error codes
 *
 */
export const errorCodes = {
    S0101: "String literal must be terminated by a matching quote",
    S0102: "Number out of range: {{token}}",
    S0103: "Unsupported escape sequence: \\{{token}}",
    S0104: "The escape sequence \\u must be followed by 4 hex digits",
    S0105: "Quoted property name must be terminated with a backquote (`)",
    S0201: "Syntax error: {{token}}",
    S0202: "Expected {{value}}, got {{token}}",
    S0203: "Expected {{value}} before end of expression",
    S0204: "Unknown operator: {{token}}",
    S0205: "Unexpected token: {{token}}",
    S0206: "Unknown expression type: {{token}}",
    S0207: "Unexpected end of expression",
    S0208: "Parameter {{value}} of function definition must be a variable name (start with $)",
    S0209: "A predicate cannot follow a grouping expression in a step",
    S0210: "Each step can only have one grouping expression",
    S0211: "The symbol {{token}} cannot be used as a unary operator",
    S0301: "Empty regular expressions are not allowed",
    S0302: "No terminating / in regular expression",
    S0402: "Choice groups containing parameterized types are not supported",
    S0401: "Type parameters can only be applied to functions and arrays",
    S0500: "Attempted to evaluate an expression containing syntax error(s)",
    T0410: "Argument {{index}} of function {{token}} does not match function signature",
    T0411: "Context value is not a compatible type with argument {{index}} of function {{token}}",
    T0412: "Argument {{index}} of function {{token}} must be an array of {{type}}",
    D1001: "Number out of range: {{value}}",
    D1002: "Cannot negate a non-numeric value: {{value}}",
    T1003: "Key in object structure must evaluate to a string; got: {{value}}",
    D1004: "Regular expression matches zero length string",
    T1005: "Attempted to invoke a non-function. Did you mean ${{{token}}}?",
    T1006: "Attempted to invoke a non-function",
    T1007: "Attempted to partially apply a non-function. Did you mean ${{{token}}}?",
    T1008: "Attempted to partially apply a non-function",
    T2001: "The left side of the {{token}} operator must evaluate to a number",
    T2002: "The right side of the {{token}} operator must evaluate to a number",
    T2003: "The left side of the range operator (..) must evaluate to an integer",
    T2004: "The right side of the range operator (..) must evaluate to an integer",
    D2005: "The left side of := must be a variable name (start with $)",
    T2006: "The right side of the function application operator ~> must be a function",
    T2007: "Type mismatch when comparing values {{value}} and {{value2}} in order-by clause",
    T2008: "The expressions within an order-by clause must evaluate to numeric or string values",
    T2009: "The values {{value}} and {{value2}} either side of operator {{token}} must be of the same data type",
    T2010: "The expressions either side of operator {{token}} must evaluate to numeric or string values",
    T2011: "The insert/update clause of the transform expression must evaluate to an object: {{value}}",
    T2012: "The delete clause of the transform expression must evaluate to a string or array of strings: {{value}}",
    T2013:
        "The transform expression clones the input object using the $clone() function.  This has been overridden in the current scope by a non-function.",
    D3001: "Attempting to invoke string function on Infinity or NaN",
    D3010: "Second argument of replace function cannot be an empty string",
    D3011: "Fourth argument of replace function must evaluate to a positive number",
    D3012: "Attempted to replace a matched string with a non-string value",
    D3020: "Third argument of split function must evaluate to a positive number",
    D3030: "Unable to cast value to a number: {{value}}",
    D3040: "Third argument of match function must evaluate to a positive number",
    D3050: "First argument of reduce function must be a function with two arguments",
    D3060: "The sqrt function cannot be applied to a negative number: {{value}}",
    D3061:
        "The power function has resulted in a value that cannot be represented as a JSON number: base={{value}}, exponent={{exp}}",
    D3070:
        "The single argument form of the sort function can only be applied to an array of strings or an array of numbers.  Use the second argument to specify a comparison function",
    D3080: "The picture string must only contain a maximum of two sub-pictures",
    D3081: "The sub-picture must not contain more than one instance of the 'decimal-separator' character",
    D3082: "The sub-picture must not contain more than one instance of the 'percent' character",
    D3083: "The sub-picture must not contain more than one instance of the 'per-mille' character",
    D3084: "The sub-picture must not contain both a 'percent' and a 'per-mille' character",
    D3085:
        "The mantissa part of a sub-picture must contain at least one character that is either an 'optional digit character' or a member of the 'decimal digit family'",
    D3086:
        "The sub-picture must not contain a passive character that is preceded by an active character and that is followed by another active character",
    D3087:
        "The sub-picture must not contain a 'grouping-separator' character that appears adjacent to a 'decimal-separator' character",
    D3088: "The sub-picture must not contain a 'grouping-separator' at the end of the integer part",
    D3089: "The sub-picture must not contain two adjacent instances of the 'grouping-separator' character",
    D3090:
        "The integer part of the sub-picture must not contain a member of the 'decimal digit family' that is followed by an instance of the 'optional digit character'",
    D3091:
        "The fractional part of the sub-picture must not contain an instance of the 'optional digit character' that is followed by a member of the 'decimal digit family'",
    D3092:
        "A sub-picture that contains a 'percent' or 'per-mille' character must not contain a character treated as an 'exponent-separator'",
    D3093:
        "The exponent part of the sub-picture must comprise only of one or more characters that are members of the 'decimal digit family'",
    D3100: "The radix of the formatBase function must be between 2 and 36.  It was given {{value}}",
    D3110: "The argument of the toMillis function must be an ISO 8601 formatted timestamp. Given {{value}}",
};
