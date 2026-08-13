import fs from 'node:fs';
import { SbxError } from '../domain/SbxError.mjs';

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
  constructor(processRunner, dockerAvailability, { projectName, composeFilePath, projectDirectory }) {
    this.processRunner = processRunner;
    this.dockerAvailability = dockerAvailability;
    this.projectName = projectName;
    this.composeFilePath = composeFilePath;
    this.projectDirectory = projectDirectory;
  }

  /** Starts every service and blocks until each reports healthy. */
  start(environment) {
    // Docker being unusable is not a failure of these services, and it
    // carries its own remedy — wrapping it would replace that with advice
    // to run a command that cannot run either.
    this.dockerAvailability.assertReady();
    this.assertComposeFilePresent();
    try {
      this.run(['up', '--detach', '--wait'], environment);
    } catch {
      // Compose already printed the detail inline; repeating the command
      // that produced it adds a line nobody reads.
      throw new SbxError(
        'The services did not start.',
        `Read why with: docker compose --project-name ${this.projectName} logs\n` +
          'A service that starts but never turns healthy usually has a wrong healthcheck, or none and is slower than `--wait` assumes.',
      );
    }
  }

  /** Stops the containers, keeping their volumes and their data. */
  stop(environment) {
    this.run(['stop'], environment);
  }

  /** Removes containers, network and volumes. The data does not survive this. */
  destroy(environment) {
    this.run(['down', '--volumes', '--remove-orphans'], environment);
  }

  /** Names of the services currently running, empty when the stack is down. */
  runningServices(environment) {
    const output = this.capture(['ps', '--services', '--filter', 'status=running'], environment);
    return output.split('\n').filter((line) => line.trim().length > 0);
  }

  /**
   * Starting needs the file itself, and Compose's own message for its
   * absence names neither the path it looked at nor the reason a sandbox
   * would be missing it.
   */
  assertComposeFilePresent() {
    if (!this.composeFilePath || fs.existsSync(this.composeFilePath)) return;
    throw new SbxError(
      `This sandbox has no compose file at ${this.composeFilePath}.`,
      'The manifest declares services, but the sandbox does not have that file — it was most likely uncommitted when the sandbox was created. Commit it, then create the sandbox again.',
    );
  }

  run(composeArguments, environment) {
    this.dockerAvailability.assertReady();
    this.processRunner.runProgram('docker', this.argumentsFor(composeArguments), {
      cwd: this.projectDirectory,
      env: environment,
    });
  }

  capture(composeArguments, environment) {
    this.dockerAvailability.assertReady();
    return this.processRunner.captureProgram('docker', this.argumentsFor(composeArguments), {
      cwd: this.projectDirectory,
      env: environment,
    });
  }

  /**
   * Teardown has to keep working after the directory holding the compose
   * file is gone, and Compose can act on an existing project by name alone.
   */
  argumentsFor(composeArguments) {
    const fileArguments =
      this.composeFilePath && fs.existsSync(this.composeFilePath)
        ? ['--file', this.composeFilePath, '--project-directory', this.projectDirectory]
        : [];
    return ['compose', '--project-name', this.projectName, ...fileArguments, ...composeArguments];
  }
}
