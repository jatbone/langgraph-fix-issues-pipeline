import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDockerClient } from "./client.js";

const IMAGE_NAME = "claude-code-runner";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const getImageName = (): string => IMAGE_NAME;

export const buildImage = async (): Promise<void> => {
  const docker = getDockerClient();

  const images = await docker.listImages({
    filters: { reference: [IMAGE_NAME] },
  });

  if (images.length > 0) {
    console.log(`Image "${IMAGE_NAME}" already exists, skipping build.`);
    return;
  }

  console.log(`Building image "${IMAGE_NAME}"...`);

  const contextPath = path.resolve(__dirname, "../../docker");
  const stream = await docker.buildImage(
    { context: contextPath, src: ["Dockerfile"] },
    { t: IMAGE_NAME },
  );

  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log(`Image "${IMAGE_NAME}" built successfully.`);
};
