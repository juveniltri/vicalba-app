import Docker from "dockerode";
import { env } from "@/env";

export const docker = new Docker({ socketPath: env.DOCKER_SOCKET_PATH });
