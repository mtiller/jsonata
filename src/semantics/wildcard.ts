import { Box, BoxType, ubox, unbox, boxValue } from "./box";
import { flatten } from "../utils";

export function evaluateWildcard(input: Box): Box {
    if (input.type === BoxType.Void) return ubox;
    let val = unbox(input);
    if (val !== null && typeof val === "object") return boxValue(flatten(Object.keys(val).map((k, i) => val[k])));
    return ubox;
}
