import { Box, ubox, boxmap, BoxType } from "../neweval/box";
export function evaluateName(name: string, input: Box): Box {
    if (input.type === BoxType.Void) return ubox;
    return boxmap(input, elem => (elem !== null && typeof elem === "object" ? elem[name] : undefined));
}
