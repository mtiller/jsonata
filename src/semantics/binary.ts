import { Box, unbox, ubox, boxValue } from "./box";
import { BinaryOperationNode } from "../ast";
import { isNumeric, unexpectedValue } from "../utils";

// TODO: Don't depend on standard functions
import { functionString } from "../functions";
import * as errors from "../errors";

function isNumber(x: any): x is number {
    return typeof x === "number";
}

export function evaluateBinaryOperation(lhsb: Box, rhsb: Box, operator: BinaryOperationNode["value"]): Box {
    let lhs = unbox(lhsb) as any;
    let rhs = unbox(rhsb) as any;
    switch (operator) {
        case "+":
        case "-":
        case "*":
        case "/":
        case "%": {
            if (lhs === undefined || rhs === undefined) return ubox;
            if (!isNumeric(lhs)) {
                throw errors.error({
                    code: "T2001",
                    token: operator,
                });
            }
            if (!isNumeric(rhs)) {
                throw errors.error({
                    code: "T2002",
                    token: operator,
                });
            }
            switch (operator) {
                case "+":
                    return boxValue(lhs + rhs);
                case "-":
                    return boxValue(lhs - rhs);
                case "*":
                    return boxValue(lhs * rhs);
                case "/":
                    return boxValue(lhs / rhs);
                case "%":
                    return boxValue(lhs % rhs);
                default:
                    return unexpectedValue<string>(
                        operator,
                        operator,
                        v => "Evaluate failed to handle case where binary operation was " + v,
                    );
            }
        }
        case "and":
        case "or": {
            if (lhs === undefined || rhs === undefined) return boxValue(false);
            switch (operator) {
                case "and":
                    return boxValue(!!lhs && !!rhs);
                case "or":
                    return boxValue(!!lhs || !!rhs);
                default:
                    return unexpectedValue<string>(
                        operator,
                        operator,
                        v => "Evaluate failed to handle case where binary operation was " + v,
                    );
            }
        }
        case "=":
        case "!=":
        case "<":
        case "<=":
        case ">":
        case ">=": {
            if (lhs === undefined || rhs === undefined) return boxValue(false);
            let ltype = typeof lhs;
            let rtype = typeof rhs;

            let validate = () => {
                // if aa or bb are not string or numeric values, then throw an error
                if (!(ltype === "string" || ltype === "number") || !(rtype === "string" || rtype === "number")) {
                    throw {
                        code: "T2010",
                        stack: new Error().stack,
                        value: !(ltype === "string" || ltype === "number") ? lhs : rhs,
                    };
                }

                //if aa and bb are not of the same type
                if (ltype !== rtype) {
                    throw {
                        code: "T2009",
                        stack: new Error().stack,
                        value: lhs,
                        value2: rhs,
                    };
                }
            };
            switch (operator) {
                case "=":
                    return boxValue(lhs === rhs);
                case "!=":
                    return boxValue(lhs !== rhs);
                case "<":
                    validate();
                    return boxValue(lhs < rhs);
                case "<=":
                    validate();
                    return boxValue(lhs <= rhs);
                case ">":
                    validate();
                    return boxValue(lhs > rhs);
                case ">=":
                    validate();
                    return boxValue(lhs >= rhs);
                default:
                    return unexpectedValue<string>(
                        operator,
                        operator,
                        v => "Evaluate failed to handle case where binary operation was " + v,
                    );
            }
        }
        case "&": {
            let lstr = lhs == undefined ? "" : functionString(lhs);
            let rstr = rhs == undefined ? "" : functionString(rhs);
            return boxValue(lstr + rstr);
        }
        case "..": {
            if (lhs === undefined || rhs === undefined) return ubox;
            if (!isNumber(lhs))
                throw new Error("Invalid operand for LHS of " + operator + " operator: " + JSON.stringify(lhs));
            if (!isNumber(rhs))
                throw new Error("Invalid operand for RHS of " + operator + " operator: " + JSON.stringify(rhs));
            if (!Number.isInteger(lhs)) {
                throw {
                    code: "T2003",
                    stack: new Error().stack,
                    value: lhs,
                };
            }
            if (!Number.isInteger(rhs)) {
                throw {
                    code: "T2004",
                    stack: new Error().stack,
                    value: rhs,
                };
            }
            let lhsv = lhs as number;
            let rhsv = rhs as number;

            // if the lhs is greater than the rhs, return undefined
            if (lhsv > rhsv) return ubox;

            let result = new Array(rhs - lhs + 1);
            for (var item = lhs, index = 0; item <= rhs; item++, index++) {
                result[index] = item;
            }
            return boxValue(result);
        }
        case "in": {
            if (lhs === undefined || rhs === undefined) return boxValue(false);
            if (!Array.isArray(rhs)) return boxValue(rhs === lhs);
            return boxValue(rhs.some(x => x === lhs));
        }
        default:
            /* istanbul ignore next */
            return unexpectedValue<string>(
                operator,
                operator,
                v => "Evaluate failed to handle case where binary operation was " + v,
            );
    }
}
