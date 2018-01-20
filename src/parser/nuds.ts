import { NUD, ParserState } from "./types";
import * as ast from "./ast";

export const prefixDefaultNUD = (bindingPower: number): NUD => {
    return (state: ParserState): ast.UnaryNode => {
        return {
            value: state.token.value,
            type: "unary",
            expression: state.expression(bindingPower),
        };
    }
}

export const terminalNUD: NUD = (state: ParserState): ast.TerminalNode => {
    let token = state.token;
    switch (state.token.type) {
        case "variable":
            return {
                type: "variable",
                value: token.value,
                position: token.position,
            };
        case "name":
            return {
                type: "name",
                value: token.value,
                position: token.position,
            };
        case "literal":
            return {
                type: "literal",
                value: token.value,
                position: token.position,
            };
        case "regex":
            return {
                type: "regex",
                value: token.value,
                position: token.position,
            };
        case "operator":
            return {
                type: "operator",
                value: token.value,
                position: token.position,
            };
        default:
            /* istanbul ignore next */
            if (state.symbol.id !== "(end)") {
                throw new Error("Unexpected terminal: " + JSON.stringify(self));
            }
            return {
                type: "end",
                value: "(end)",
                position: token.position,
            }
    }
}

export const wildcardNUD = (state: ParserState): ast.WildcardNode => {
    return {
        value: state.token.value,
        type: "wildcard",
    };
}

export const descendantNUD = (state: ParserState): ast.DescendantNode => {
    return {
        value: state.token.value,
        type: "descendant",
    };
}