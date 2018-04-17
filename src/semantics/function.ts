import * as ast from "../ast";
import { FunctionInvocationNode } from "../ast";

export function functionName(expr: ast.FunctionInvocationNode): string | null {
    return expr.procedure.type === "path" ? expr.procedure.steps[0].value : null;
}

export function prependArgument(func: ast.FunctionInvocationNode, arg: ast.ASTNode): FunctionInvocationNode {
    return {
        type: "function",
        value: func.value,
        position: func.position,
        procedure: func.procedure,
        arguments: [arg, ...func.arguments],
        nextFunction: func.nextFunction,
    };
}
