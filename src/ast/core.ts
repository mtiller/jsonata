import { BaseNode } from './base';
import { ASTNode } from './index';
import { Signature } from "../signatures";

export interface LiteralNode extends BaseNode {
    type: "literal";
}

export interface VariableNode extends BaseNode {
    type: "variable";
    value: string;
}

export interface NameNode extends BaseNode {
    type: "name";
}

export interface RegexNode extends BaseNode {
    type: "regex";
}

export interface WildcardNode extends BaseNode {
    type: "wildcard";
}

export interface DescendantNode extends BaseNode {
    type: "descendant";
}

export interface GroupNode extends BaseNode {
    type: "group";
    lhs: ASTNode;
    groupings: ASTNode[][];
}

export interface ArrayConstructorNode extends BaseNode {
    type: "array";
    value: "[";
    expressions: ASTNode[];
    // TODO: Do we still need this? (now that we have a dedicated array node?)
    consarray: boolean;
}

export interface UnaryMinusNode extends BaseNode {
    type: "unary";
    value: "-";
    expression: ASTNode;
}

export interface UnaryObjectNode extends BaseNode {
    type: "unary";
    value: "{";
    lhs: ASTNode[][];
}

export interface BinaryOperationNode extends BaseNode {
    type: "binary";
    value: "+" | "-" | "*" | "/" | "%" | "=" | "!=" | "<" | "<=" | ">" | ">=" | "&" | "and" | "or" | ".." | "in"; // TODO: There must be more?!? (e.g., comparisons)
    lhs: ASTNode;
    rhs: ASTNode; // ASTNode if operator is "." | "[" | ":=" | "~>"
}

export interface BindNode extends BaseNode {
    type: "bind";
    lhs: VariableNode;
    rhs: ASTNode;
}

export interface SortTerm {
    descending: boolean;
    expression: ASTNode;
}

export interface SortNode extends BaseNode {
    type: "sort";
    lhs: ASTNode;
    rhs: SortTerm[];
}

export interface TernaryNode extends BaseNode {
    type: "condition";
    condition: ASTNode;
    then: ASTNode;
    else: ASTNode;
    position: number;
}

export interface BlockNode extends BaseNode {
    type: "block";
    expressions: ASTNode[];
}

export interface TransformNode extends BaseNode {
    type: "transform";
    pattern: ASTNode;
    update: ASTNode;
    delete: ASTNode | null;
}

export interface FunctionInvocationNode extends BaseNode {
    type: "function" | "partial";
    procedure: ASTNode;
    arguments: ASTNode[];
    // This is added when creating PathNodes.
    nextFunction: Function | null;
}

export interface LambdaDefinitionNode extends BaseNode {
    type: "lambda";
    body: ASTNode;
    signature: Signature;
    arguments: ASTNode[];
    thunk: boolean;
}
