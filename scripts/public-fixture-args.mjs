import path from "node:path";

export const parseGeneratorArguments = (args) => {
  let outputRoot = ".";
  for (const argument of args) {
    if (!argument.startsWith("--output-root="))
      throw new Error(`Unknown generator argument: ${argument}`);
    const value = argument.slice("--output-root=".length);
    if (!value) throw new Error("--output-root requires a value");
    outputRoot = value;
  }
  return { outputRoot: path.resolve(outputRoot) };
};
