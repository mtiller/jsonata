import { NUD, LED, ParserState } from "./types";
import { parseSignature } from '../signatures';
import * as ast from "./ast";

export const infixDefaultLED = (bindingPower: number): LED => {
    return (state: ParserState, left: ast.ASTNode): ast.BinaryNode => {
        let rhs = state.expression(bindingPower);
        return {
            value: state.previousToken.value,
            type: "binary",
            lhs: left,
            rhs: rhs,
        };
    };
};

// export const functionLED: LED = (state: ParserState, left: ast.ASTNode): ast.FunctionInvocationNode | ast.LambdaDefinitionNode => {
//     // left is is what we are trying to invoke
//     let type: "function" | "partial" = "function";
//     let args = [];
//     if (state.symbol.id !== ")") {
//         for (;;) {
//             if (state.token.type === "operator" && state.symbol.id === "?") {
//                 // partial function application
//                 type = "partial";
//                 args.push({
//                     type: "operator",
//                     position: state.token.position,
//                     value: state.token.value,
//                 });
//                 state.advance("?");
//             } else {
//                 args.push(state.expression(0));
//             }
//             if (state.symbol.id !== ",") break;
//             state.advance(",");
//         }
//     }
//     state.advance(")", true);

//     // if the name of the function is 'function' or λ, then this is function definition (lambda function)
//     let isLambda = left.type === "name" && (left.value === "function" || left.value === "\u03BB");

//     if (!isLambda) {
//         let alt: ast.FunctionInvocationNode = {
//             position: state.token.position,
//             value: state.token.value,
//             type: type,
//             arguments: args,
//             procedure: left,
//         };
//         return alt;
//     }
//     // all of the args must be VARIABLE tokens
//     args.forEach((arg, index) => {
//         if (arg.type !== "variable") {
//             return state.handleError({
//                 code: "S0208",
//                 stack: new Error().stack,
//                 position: arg.position,
//                 token: arg.value,
//                 value: index + 1,
//             });
//         }
//     });
//     // is the next token a '<' - if so, parse the function signature
//     let signature = undefined;
//     if (state.symbol.id === "<") {
//         var sigPos = state.token.position;
//         var depth = 1;
//         var sig = "<";
//         let id = state.symbol.id;
//         // TODO: Bug in typescript compiler?...doesn't recognize side effects in advance and impact on node value
//         while (depth > 0 && id !== "{" && id !== "(end)") {
//             state.advance();
//             id = state.symbol.id;
//             if (id === ">") {
//                 depth--;
//             } else if (id === "<") {
//                 depth++;
//             }
//             sig += state.token.value;
//         }
//         state.advance(">");
//         try {
//             signature = parseSignature(sig);
//         } catch (err) {
//             // insert the position into this error
//             err.position = sigPos + err.offset;
//             // TODO: If recover is true, we need to force the return of an
//             // error node here.  In the tests, recover is never set so this
//             // always throws.
//             state.handleError(err);
//             /* istanbul ignore next */
//             throw err;
//         }
//     }
//     // parse the function body
//     state.advance("{");
//     let body = state.expression(0);
//     state.advance("}");
//     return {
//         value: state.token.value,
//         type: "lambda",
//         body: body,
//         signature: signature,
//         procedure: left,
//         arguments: args,
//     };
// }