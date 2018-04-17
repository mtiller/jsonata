import { Box, BoxType, ubox, unbox, boxValue } from "../neweval/box";

export function evaluateDescendant(input: Box): Box {
    switch (input.type) {
        case BoxType.Void:
        case BoxType.Lambda:
        case BoxType.Function:
            return ubox;
        case BoxType.Array:
        case BoxType.Value:
            let val = unbox(input);
            return boxValue(descendants(val));
    }
}

function descendants(val: any): Array<any> {
    if (Array.isArray(val)) {
        return val.reduce((prev, x) => [...prev, ...descendants(x)], []);
    } else {
        if (typeof val != "object") return [val];
        if (val === null) return [null];
        return Object.keys(val).reduce((prev, x) => [...prev, ...descendants(val[x])], [val]);
    }
}
