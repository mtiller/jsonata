import { Box, BoxType, unbox, ubox, boxValue } from "../neweval/box";
import * as errors from "../errors";
import * as ast from "../ast";
import { isNumeric } from "../utils";

export function evaluateUnaryMinus(lhs: Box, expr: ast.UnaryMinusNode): Box {
    if (lhs.type == BoxType.Void) return ubox;
    let v = unbox(lhs);
    // This happens if v was boxed as an empty array
    // (see note in boxValue function about this)
    if (v === undefined) return ubox;
    if (isNumeric(v)) {
        return boxValue(-v);
    } else {
        throw errors.error({
            code: "D1002",
            position: expr.position,
            token: expr.value,
            value: unbox(lhs),
        });
    }
}
