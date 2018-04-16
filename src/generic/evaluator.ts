import * as ast from "../ast";

export interface Evaluator<I, O> {
    evaluateVariable(node: ast.VariableNode, input: I): O;
    evaluateLiteral(node: ast.LiteralNode, input: I): O;
    evaluateName(node: ast.NameNode, input: I): O;
    evaluateWildcard(node: ast.WildcardNode, input: I): O;
    evaluateArray(node: ast.ArrayConstructorNode, input: I): O;
    evaluatePredicate(node: ast.PredicateNode, input: I): O;
    evaluateBind(node: ast.PredicateNode, input: I): O;
    evaluateBlock(node: ast.BlockNode, input: I): O;
    evaluatePath(node: ast.PathNode, input: I): O;
    evaluateBinary(node: ast.BinaryOperationNode, input: I): O;
    evaluateLambda(node: ast.LambdaDefinitionNode, input: I): O;
    evaluateFunction(node: ast.FunctionInvocationNode, input: I): O;
    evaluateGroup(node: ast.GroupNode, input: I): O;
    evaluateCondition(node: ast.TernaryNode, input: I): O;
    evaluateApply(node: ast.ApplyNode, input: I): O;
    evaluateTransform(node: ast.TransformNode, input: I): O;
    evaluateDescendant(node: ast.DescendantNode, input: I): O;
    evaluatePartial(node: ast.FunctionInvocationNode, input: I): O;
    evaluateSort(node: ast.SortNode, input: I): O;
    evaluateRegex(node: ast.RegexNode, input: I): O;
}

export type SimpleEvaluator<B> = Evaluator<B, B>;

export interface Container {
    evaluateLiteral(node: ast.LiteralNode): Container;
    evaluateVariable(node: ast.VariableNode): Container;
    evaluateName(node: ast.NameNode): Container;
}
