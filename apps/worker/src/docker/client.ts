import Docker from "dockerode";

let instance: Docker | null = null;

export const getDockerClient = (): Docker => {
  if (!instance) {
    instance = new Docker();
  }
  return instance;
};

export const getContainer = (containerId: string) => {
  return getDockerClient().getContainer(containerId);
};
