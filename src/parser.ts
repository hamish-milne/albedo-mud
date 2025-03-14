interface CommandContext {
  continue(tree: ParseTree): boolean;
  words: string[];
}

export type Token = string | ((context: CommandContext) => boolean);
export type ParseTree = [
  Token,
  ((context: CommandContext) => void) | ParseTree,
][];
