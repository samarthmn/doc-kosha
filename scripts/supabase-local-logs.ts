import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import process from "node:process";

const SUPABASE_CONTAINER_PREFIX = "supabase_";

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getSupabaseProjectName = (): string => {
  const fromEnv = process.env.SUPABASE_PROJECT_NAME?.trim();
  if (fromEnv) return fromEnv;

  // Supabase CLI derives container names from the local project name (usually folder name).
  const parts = process.cwd().split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? "project";
};

const listRunningDockerContainers = (): string[] => {
  const result = spawnSync("docker", ["ps", "--format", "{{.Names}}"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return [];

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
};

const waitForSupabaseContainers = async (
  projectName: string,
): Promise<string[]> => {
  const projectRegex = new RegExp(
    `^${escapeRegExp(SUPABASE_CONTAINER_PREFIX)}.+_${escapeRegExp(projectName)}$`,
  );
  let lastNoticeAt = 0;

  // Wait indefinitely; this script is intended to be used in long-running `pnpm dev:*` flows.
  // If Docker isn't running, `docker ps` will fail and we'll keep retrying.
  while (true) {
    const containers = listRunningDockerContainers().filter((name) =>
      projectRegex.test(name),
    );
    if (containers.length > 0) return containers.sort();

    const now = Date.now();
    if (now - lastNoticeAt > 10_000) {
      process.stderr.write(
        `[supabase] Waiting for Supabase containers for project "${projectName}"...\n`,
      );
      lastNoticeAt = now;
    }

    await sleep(1000);
  }
};

const prefixLines = (
  stream: NodeJS.ReadableStream,
  prefix: string,
  write: (chunk: string) => void,
): void => {
  let buffer = "";

  const toText = (chunk: unknown): string => {
    if (typeof chunk === "string") return chunk;
    if (Buffer.isBuffer(chunk)) return chunk.toString("utf8");
    if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString("utf8");
    return String(chunk);
  };

  stream.on("data", (chunk: unknown) => {
    buffer += toText(chunk);

    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";

    for (const line of parts) {
      write(`${prefix}${line}\n`);
    }
  });

  stream.on("end", () => {
    if (buffer.length > 0) {
      write(`${prefix}${buffer}\n`);
      buffer = "";
    }
  });
};

const main = async (): Promise<void> => {
  const projectName = getSupabaseProjectName();
  const containers = await waitForSupabaseContainers(projectName);

  process.stderr.write(
    `[supabase] Tailing logs for ${containers.length} container(s)...\n`,
  );

  const children: ChildProcess[] = [];

  const shutdown = (): void => {
    for (const child of children) {
      child.kill("SIGINT");
    }
  };

  process.on("SIGINT", () => {
    shutdown();
    process.exit(130);
  });

  process.on("SIGTERM", () => {
    shutdown();
    process.exit(143);
  });

  for (const container of containers) {
    const child = spawn("docker", ["logs", "-f", "--tail", "50", container], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);

    const tag = `[${container}] `;
    if (child.stdout) {
      prefixLines(child.stdout, tag, (line) => process.stdout.write(line));
    }
    if (child.stderr) {
      prefixLines(child.stderr, tag, (line) => process.stderr.write(line));
    }

    child.on("exit", (code) => {
      const status = code === null ? "signal" : `code ${code}`;
      process.stderr.write(`[${container}] exited (${status})\n`);
    });
  }

  // Keep the parent alive as long as at least one child is alive.
  while (true) {
    const anyAlive = children.some((child) => child.exitCode === null);
    if (!anyAlive) return;
    await sleep(1000);
  }
};

void main();
