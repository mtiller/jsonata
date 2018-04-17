import { Box, boxArray, BoxType, unbox } from "./box";
import * as ast from "../ast";

export interface Path {
    head: Box;
    path: ast.ASTNode[];
}

export function extractSteps(
    expr: ast.PathNode,
    input: Box,
    firstVal: Box,
    nonpred: ast.ASTNode,
    legacyMode: boolean,
): Path {
    let rest = expr.steps.slice(1);
    if (legacyMode) {
        // If first node is an array (constructor), then we should treat the array
        // as the effective input
        if (nonpred.type === "array" && nonpred.consarray) {
            return {
                head: firstVal,
                path: rest,
            };
        }
        // If the first is a variable, then we need to start our path with a
        // scalar input vector...
        if (nonpred.type === "variable") {
            return {
                head: boxArray([unbox(input)]),
                path: expr.steps,
            };
        }
        switch (input.type) {
            case BoxType.Void:
                return { head: boxArray([unbox(input)]), path: expr.steps };
            case BoxType.Array:
                return { head: input, path: expr.steps };
            case BoxType.Value: {
                if (input.values.length == 0) return { head: boxArray([unbox(input)]), path: expr.steps };
                return { head: input, path: expr.steps };
            }
            // ???
            default:
                return { head: input, path: expr.steps };
        }
    }

    throw new Error("Cannot evaluate non-legacy paths (yet)");
}
