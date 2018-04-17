import { Box, unbox } from "./box";
import * as errors from "../errors";

export interface IndexedBox {
    index: number;
    value: Box;
}

export interface Ranking {
    values: Box[];
}

export interface Ranked {
    terms: number;
    descending: boolean[];
    entries: Ranking[];
}

export function comparator(ranked: Ranked) {
    return (a: IndexedBox, b: IndexedBox): number => {
        for (let i = 0; i < ranked.terms; i++) {
            let scale = ranked.descending[i] ? -1 : 1;
            let aval = unbox(ranked.entries[a.index].values[i]);
            let bval = unbox(ranked.entries[b.index].values[i]);

            let atype = typeof aval;
            let btype = typeof bval;

            if (atype === "undefined") {
                if (btype === "undefined") continue;
                return 1;
            }
            if (btype === "undefined") return -1;

            // if aa or bb are not string or numeric values, then throw an error
            if (!(atype === "string" || atype === "number") || !(btype === "string" || btype === "number")) {
                throw errors.error({
                    code: "T2008",
                    value: !(atype === "string" || atype === "number") ? aval : bval,
                });
            }

            //if aa and bb are not of the same type
            if (atype !== btype) {
                throw errors.error({
                    code: "T2007",
                    value: aval,
                    value2: bval,
                });
            }
            // both the same - move on to next term
            if (aval === bval) continue;
            return aval < bval ? -scale : scale;
        }
        // If no RHS terms, everything is equal
        return 0;
    };
}
