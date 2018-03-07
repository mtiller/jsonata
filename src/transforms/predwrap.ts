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
            expr = { ...orig, predicate: [] };
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
                else: expr.else ? elaboratePredicates(expr.else) : undefined,
                position: expr.position,
            } as ast.TernaryNode;
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
            // We extract the first one because it doesn't get the "map"
            // treatment and neither do its predicates (so we elborate it).
            let [first, ...rest] = expr.steps;

            // For all the steps following dots, we flatten all the steps (i.e.,
            // step, pred*, step, pred*).
            let steps = rest.reduce((prev, step) => {
                let spreds: ast.ASTNode[] = Array.isArray(step.predicate) ? step.predicate : [];
                let predless = { ...step, predicate: [] };
                let preds = spreds.map(pred => ({
                    type: "predicate",
                    value: "[",
                    position: pred.position,
                    condition: elaboratePredicates(pred),
                    lhs: {
                        type: "variable",
                        value: "",
                        position: pred.position,
                    },
                }));
                return [...prev, elaboratePredicates(predless), ...preds];
            }, []);
            expr = {
                ...base(expr),
                steps: [elaboratePredicates(first), ...steps],
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
        case "operator": {
            expr = { ...base(expr) };
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
        case "singleton": {
            throw new Error("Raw AST node of type " + expr.type + " found in optimized tree while wrapping predicates");
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
