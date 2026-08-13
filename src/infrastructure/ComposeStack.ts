import fs from 'node:fs';
import { SbxError } from '@/domain/SbxError.js';
import { type DockerAvailability } from '@/infrastructure/DockerAvailability.js';
import { type EnvMap, type ProcessRunner } from '@/infrastructure/ProcessRunner.js';

export interface ComposeStackOptions {
  projectName: string;
  composeFilePath: string | null;
  projectDirectory: string;
}

/**
 * The stateful services of one sandbox, run as a Docker Compose project
 * named after it. Compose already namespaces containers, networks and
 * volumes per project, so isolation between sandboxes costs nothing here
 * and `down --volumes` is a complete teardown.
 *
 * The compose file is read from the sandbox's own clone, so a branch
 * that changes the service set takes effect without touching the tool.
 */
export class ComposeStack {
  private readonly processRunner: ProcessRunner;
  private readonly dockerAvailability: DockerAvailability;
  readonly projectName: string;
  readonly composeFilePath: string | null;
  readonly projectDirectory: string;

  constructor(
    processRunner: ProcessRunner,
    dockerAvailability: DockerAvailability,
    { projectName, composeFilePath, projectDirectory }: ComposeStackOptions,
  ) {
    this.processRunner = processRunner;
    this.dockerAvailability = dockerAvailability;
    this.projectName = projectName;
    this.composeFilePath = composeFilePath;
    this.projectDirectory = projectDirectory;
  }

  /** Starts every service and blocks until each reports healthy. */
  start(environment: EnvMap): void {
    this.dockerAvailability.assertReady();
    this.assertComposeFilePresent();
    try {
      this.run(['up', '--detach', '--wait'], environment);
    } catch {
      throw new SbxError(
        'The services did not start.',
        `Read why with: docker compose --project-name ${this.projectName} logs\n` +
          'A service that starts but never turns healthy usually has a wrong healthcheck, or none and is slower than `--wait` assumes.',
      );
    }
  }

  /** Stops the containers, keeping their volumes and their data. */
  stop(environment: EnvMap): void {
    this.run(['stop'], environment);
  }

  /** Removes containers, network and volumes. The data does not survive this. */
  destroy(environment: EnvMap): void {
    this.run(['down', '--volumes', '--remove-orphans'], environment);
  }

  /** Names of the services currently running, empty when the stack is down. */
  runningServices(environment: EnvMap): string[] {
    const output = this.capture(['ps', '--services', '--filter', 'status=running'], environment);
    return output.split('\n').filter((line) => line.trim().length > 0);
  }

  private assertComposeFilePresent(): void {
    if (!this.composeFilePath || fs.existsSync(this.composeFilePath)) return;
    throw new SbxError(
      `This sandbox has no compose file at ${this.composeFilePath}.`,
      'The manifest declares services, but the sandbox does not have that file — it was most likely uncommitted when the sandbox was created. Commit it, then create the sandbox again.',
    );
  }

  private run(composeArguments: readonly string[], environment: EnvMap): void {
    this.dockerAvailability.assertReady();
    this.processRunner.runProgram('docker', this.argumentsFor(composeArguments), {
      cwd: this.projectDirectory,
      env: environment,
    });
  }

  private capture(composeArguments: readonly string[], environment: EnvMap): string {
    this.dockerAvailability.assertReady();
    return this.processRunner.captureProgram('docker', this.argumentsFor(composeArguments), {
      cwd: this.projectDirectory,
      env: environment,
    });
  }

  private argumentsFor(composeArguments: readonly string[]): string[] {
    const fileArguments =
      this.composeFilePath && fs.existsSync(this.composeFilePath)
        ? ['--file', this.composeFilePath, '--project-directory', this.projectDirectory]
        : [];
    return ['compose', '--project-name', this.projectName, ...fileArguments, ...composeArguments];
  }
}
