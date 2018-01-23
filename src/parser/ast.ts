import { Token } from "../tokenizer";
import { Signature } from '../signatures';

export interface BaseNode {
    type: string;
    value: any;
    keepArray?: boolean;
    // TODO: This is only added to the root expression node...should probably be a separate return value from parser
    errors?: string[];
}

export interface WildcardNode extends BaseNode {
    type: "wildcard";
}

export interface DescendantNode extends BaseNode {
    type: "descendant";
}

export interface ErrorFields {
    code: string;
}

export interface ErrorNode extends BaseNode {
    type: "error";
    // TODO: refine
    error: ErrorFields;
    // TODO: refine
    lhs: ASTNode;
    remaining: Token[];
}

export interface VariableNode extends BaseNode {
    type: "variable";
    position: number;
}

export interface NameNode extends BaseNode {
    type: "name";
    position: number;
}
export interface LiteralNode extends BaseNode {
    type: "literal";
    position: number;
}

export interface RegexNode extends BaseNode {
    type: "regex";
    position: number;
}

export interface OperatorNode extends BaseNode {
    type: "operator";
    position: number;
}

export interface EndNode extends BaseNode {
    type: "end";
    value: string;
    position: number;
}

export type TerminalNode = VariableNode | NameNode | LiteralNode | RegexNode | OperatorNode | EndNode;

export interface UnaryNode extends BaseNode {
    type: "unary";
    expression?: ASTNode;
    lhs?: ASTNode[];
    expressions?: ASTNode[];
}

export interface BinaryNode extends BaseNode {
    type: "binary";
    value: "+" | "[" | ".."; // TODO: There must be more?!?
    lhs: ASTNode;
    rhs: ASTNode | ASTNode[];
    position?: number; // Required for sort operator!?!
}

export interface TernaryNode extends BaseNode {
    type: "condition";
    condition: ASTNode;
    then: ASTNode;
    else: ASTNode;
}

export interface BlockNode extends BaseNode {
    type: "block";
    expressions: ASTNode[];
}

export interface TransformNode extends BaseNode {
    type: "transform";
    // TODO: Refine these
    pattern: ASTNode;
    update: ASTNode;
    delete?: ASTNode;
}

export interface FunctionInvocationNode extends BaseNode {
    type: "function" | "partial";
    procedure: ASTNode;
    arguments: ASTNode[];
    position: number;
}

export interface LambdaDefinitionNode extends BaseNode {
    type: "lambda";
    body: ASTNode;
    signature: Signature;
    procedure: ASTNode;
    arguments: ASTNode[];
}

export type ASTNode =
    | WildcardNode
    | DescendantNode
    | ErrorNode
    | LiteralNode
    | NameNode
    | VariableNode
    | RegexNode
    | OperatorNode
    | UnaryNode
    | BinaryNode
    | TernaryNode
    | BlockNode
    | TransformNode
    | FunctionInvocationNode
    | LambdaDefinitionNode
    | EndNode;
