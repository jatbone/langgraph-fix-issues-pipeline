import Docker from "dockerode";
import { PassThrough } from "stream";

export const createDockerClient = (): Docker => {
  return new Docker();
};

export const getContainer = (docker: Docker, containerId: string) => {
  return docker.getContainer(containerId);
};

export const execInContainer = async (
  docker: Docker,
  containerId: string,
  cmd: string[],
): Promise<string> => {
  const container = docker.getContainer(containerId);

  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });

  const execStream = await exec.start({});

  // Demux Docker multiplexed stream into separate stdout/stderr
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const stdout = new PassThrough();
  const stderr = new PassThrough();

  stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  stderr.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk);
    process.stderr.write(chunk);
  });

  await new Promise<void>((resolve) => {
    execStream.on("end", resolve);
    docker.modem.demuxStream(execStream, stdout, stderr);
  });

  const { ExitCode: StatusCode } = await exec.inspect();

  const output = Buffer.concat(stdoutChunks).toString("utf-8").trim();

  if (StatusCode !== 0) {
    throw new Error(`Claude exited with code ${StatusCode}:\n${output}`);
  }

  return output;
};

export type TStreamEvent = {
  type: string;
  [key: string]: unknown;
};

export const streamExecInContainer = async (
  docker: Docker,
  containerId: string,
  cmd: string[],
  onEvent: (event: TStreamEvent) => void,
): Promise<TStreamEvent> => {
  const container = docker.getContainer(containerId);

  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });

  const execStream = await exec.start({});

  const stdout = new PassThrough();
  const stderr = new PassThrough();

  let lineBuffer = "";
  let resultEvent: TStreamEvent | null = null;

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as TStreamEvent;
      onEvent(parsed);
      if (parsed.type === "result") {
        resultEvent = parsed;
      }
    } catch {
      // non-JSON line, skip
    }
  };

  stdout.on("data", (chunk: Buffer) => {
    lineBuffer += chunk.toString("utf-8");
    const lines = lineBuffer.split("\n");
    lineBuffer = lines.pop()!;
    for (const line of lines) {
      processLine(line);
    }
  });

  stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
  });

  docker.modem.demuxStream(execStream, stdout, stderr);

  await new Promise<void>((resolve) => {
    execStream.on("end", () => {
      processLine(lineBuffer);
      resolve();
    });
  });

  const { ExitCode: StatusCode } = await exec.inspect();

  if (StatusCode !== 0) {
    throw new Error(`Claude exited with code ${StatusCode}`);
  }

  if (!resultEvent) {
    throw new Error("No result event received from Claude CLI stream");
  }

  return resultEvent;
};
