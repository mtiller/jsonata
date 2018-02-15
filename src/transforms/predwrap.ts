import * as ast from "../ast";
import { unexpectedValue } from "../utils";

export function elaboratePredicates(orig: ast.ASTNode): ast.ASTNode {
    let predicates: ast.ASTNode[] = Array.isArray(orig.predicate) ? orig.predicate : [];

    let expr: ast.ASTNode = orig;
    switch (expr.type) {
        case "variable":
        case "wildcard":
        case "descendant":
        case "name":
        case "literal":
        case "regex":
            expr = { ...orig };
            delete expr["predicate"];
            // These have no children, so do nothing (except wrap in predicates at the end).
            break;
        case "unary": {
            let expr1 = expr;
            switch (expr1.value) {
                case "-":
                    expr = {
                        ...base(expr1),
                        expression: elaboratePredicates(expr1),
                    } as ast.UnaryMinusNode;
                    break;
                case "{":
                    expr = {
                        ...base(expr1),
                        lhs: expr1.lhs.map(x1 => x1.map(x2 => elaboratePredicates(x2))),
                    } as ast.UnaryObjectNode;
                    break;
                default:
                    return unexpectedValue<ast.ASTNode>(
                        expr,
                        expr1,
                        v => "Evaluate failed to handle case where expression type was " + v.type,
                    );
            }
            break;
        }
        case "array": {
            expr = {
                ...base(expr),
                expressions: expr.expressions.map(x => elaboratePredicates(x)),
                consarray: expr.consarray,
            };
            break;
        }
        case "group":
            expr = {
                ...base(expr),
                lhs: elaboratePredicates(expr.lhs),
                groupings: expr.groupings.map(x1 => x1.map(x2 => elaboratePredicates(x2))),
            };
            break;
        case "binary":
            expr = {
                ...base(expr),
                lhs: elaboratePredicates(expr.lhs),
                rhs: elaboratePredicates(expr.rhs),
            };
            break;
        case "sort":
            expr = {
                ...base(expr),
                lhs: elaboratePredicates(expr.lhs),
                rhs: expr.rhs,
            };
            break;
        case "condition": {
            expr = {
                ...base(expr),
                condition: elaboratePredicates(expr.condition),
                then: elaboratePredicates(expr.then),
                else: elaboratePredicates(expr.else),
                position: expr.position,
            };
            break;
        }
        case "block": {
            expr = {
                ...base(expr),
                expressions: expr.expressions.map(x => elaboratePredicates(x)),
            };
            break;
        }
        case "transform": {
            expr = {
                ...base(expr),
                pattern: elaboratePredicates(expr.pattern),
                update: elaboratePredicates(expr.update),
                delete: expr.delete == null ? null : elaboratePredicates(expr.delete),
            };
            break;
        }
        case "function":
        case "partial": {
            expr = {
                ...base(expr),
                procedure: elaboratePredicates(expr.procedure),
                arguments: expr.arguments.map(elaboratePredicates),
                nextFunction: expr.nextFunction,
            };
            break;
        }
        case "lambda": {
            expr = {
                ...base(expr),
                body: elaboratePredicates(expr.body),
                signature: expr.signature,
                arguments: expr.arguments.map(elaboratePredicates),
                thunk: expr.thunk,
            };
            break;
        }
        case "path": {
            expr = {
                ...base(expr),
                steps: expr.steps.map(elaboratePredicates),
                keepSingletonArray: expr.keepSingletonArray,
            };
            break;
        }
        case "bind": {
            expr = {
                ...base(expr),
                lhs: expr.lhs,
                rhs: elaboratePredicates(expr.rhs),
            };
            break;
        }
        case "apply": {
            expr = {
                ...base(expr),
                lhs: elaboratePredicates(expr.lhs),
                rhs: elaboratePredicates(expr.rhs),
            };
            break;
        }

        /* istanbul ignore next */
        case "grouped-object":
        /* istanbul ignore next */
        case "proxy":
        /* istanbul ignore next */
        case "end":
        /* istanbul ignore next */
        case "error":
        /* istanbul ignore next */
        case "operator":
        /* istanbul ignore next */
        case "singleton": {
            throw new Error("Raw AST node found in optimized tree");
        }

        case "predicate":
            throw new Error("Shouldn't find predicate node prior to elaborating predicates");
        default:
            /* istanbul ignore next */
            return unexpectedValue<ast.ASTNode>(
                expr,
                expr,
                v => "Evaluate failed to handle case where expression type was " + v.type,
            );
    }
    return predicates.reduce(
        (cur, predicate) => ({
            type: "predicate",
            value: "[",
            position: predicate.position,
            condition: predicate,
            lhs: cur,
        }),
        expr,
    );
}

function base<T extends string, V>(a: {
    type: T;
    value: V;
    position: number;
}): { type: T; value: V; position: number } {
    return {
        type: a.type,
        value: a.value,
        position: a.position,
    };
}
