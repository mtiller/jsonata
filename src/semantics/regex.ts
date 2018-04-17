import { Box, boxFunction } from "./box";

export function evaluateRegex(regexp: RegExp, position: number): Box {
    // Create a new RegExp instance here since it has internal state
    // (e.g., lastIndex, see https://github.com/jsonata-js/jsonata/issues/205)
    let re = new RegExp(regexp);
    const closure = (str: string) => {
        var result;
        var match = re.exec(str);
        if (match !== null) {
            result = {
                match: match[0],
                start: match.index,
                end: match.index + match[0].length,
                groups: [],
            };
            if (match.length > 1) {
                for (var i = 1; i < match.length; i++) {
                    result.groups.push(match[i]);
                }
            }
            result.next = () => {
                if (re.lastIndex >= str.length) {
                    return undefined;
                } else {
                    var next = closure(str);
                    if (next && next.match === "") {
                        // matches zero length string; this will never progress
                        throw {
                            code: "D1004",
                            stack: new Error().stack,
                            position: position,
                            value: re.source,
                        };
                    }
                    return next;
                }
            };
        }

        return result;
    };
    return boxFunction({
        implementation: closure,
        signature: undefined,
    });
}
