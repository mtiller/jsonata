import * as raw from './raw';
import * as core from './core';
import * as opt from './opt';

export * from './raw';
export * from './core';
export * from './opt';
export * from './base';

/**
 * These are the AST nodes that come directly out of the parser before
 * ast_optimize is called.
 */
export type ASTNode =
    | raw.ProxyBinaryNode
    | raw.EndNode
    | raw.ErrorNode
    | raw.OperatorNode
    | raw.SingletonArrayDecorator
    | raw.GroupedObjectNode
    | core.WildcardNode
    | core.DescendantNode
    | core.GroupNode
    | core.LiteralNode
    | core.VariableNode
    | core.NameNode
    | core.RegexNode
    | core.UnaryMinusNode
    | core.UnaryObjectNode
    | core.ArrayConstructorNode
    | core.BinaryOperationNode
    | core.BindNode
    | core.SortNode
    | core.TernaryNode
    | core.BlockNode
    | core.TransformNode
    | core.FunctionInvocationNode
    | core.LambdaDefinitionNode
    | opt.PathNode
    | opt.ApplyNode
    | opt.PredicateNode;