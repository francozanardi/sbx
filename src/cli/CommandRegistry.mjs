import { CodeCommand } from '../commands/CodeCommand.mjs';
import { CreateCommand } from '../commands/CreateCommand.mjs';
import { DeleteCommand } from '../commands/DeleteCommand.mjs';
import { DoctorCommand } from '../commands/DoctorCommand.mjs';
import { DownCommand } from '../commands/DownCommand.mjs';
import { InfoCommand } from '../commands/InfoCommand.mjs';
import { InitCommand } from '../commands/InitCommand.mjs';
import { ListCommand } from '../commands/ListCommand.mjs';
import { OpenCommand } from '../commands/OpenCommand.mjs';
import { RunCommand } from '../commands/RunCommand.mjs';
import { SeedCommand } from '../commands/SeedCommand.mjs';
import { SyncCommand } from '../commands/SyncCommand.mjs';
import { UpCommand } from '../commands/UpCommand.mjs';
import { EnvironmentFileWriter } from '../application/EnvironmentFileWriter.mjs';
import { HookRunner } from '../application/HookRunner.mjs';
import { ManifestScaffolder } from '../application/ManifestScaffolder.mjs';
import { ProjectWorkspace } from '../application/ProjectWorkspace.mjs';
import { SandboxCreator } from '../application/SandboxCreator.mjs';
import { SandboxRemover } from '../application/SandboxRemover.mjs';
import { SandboxSynchronizer } from '../application/SandboxSynchronizer.mjs';
import { SetupInspector } from '../application/SetupInspector.mjs';
import { EcosystemCatalog } from '../domain/EcosystemCatalog.mjs';
import { DockerAvailability } from '../infrastructure/DockerAvailability.mjs';
import { GitClones } from '../infrastructure/GitClones.mjs';
import { PortProbe } from '../infrastructure/PortProbe.mjs';
import { SecretGenerator } from '../infrastructure/SecretGenerator.mjs';
import { TemplateRenderer } from '../infrastructure/TemplateRenderer.mjs';
import { SandboxReporter } from './SandboxReporter.mjs';

/**
 * Builds the commands and everything they depend on.
 *
 * The split is between commands that need a project manifest and the one
 * that exists to create it: `init` has to work in a directory that has no
 * manifest yet, which is the only reason it is separated.
 */
export class CommandRegistry {
  constructor({ terminal, processRunner, homePath }) {
    this.terminal = terminal;
    this.processRunner = processRunner;
    this.homePath = homePath;
  }

  /** Commands that work in any directory. */
  standalone() {
    return new Map([['init', this.buildInit()]]);
  }

  /** Every command, wired against one project. */
  forProject(manifest) {
    const dockerAvailability = new DockerAvailability(this.processRunner);
    const clones = new GitClones(this.processRunner, manifest.rootDirectory);
    const workspace = new ProjectWorkspace(manifest, this.homePath, this.processRunner, dockerAvailability, clones);
    const hookRunner = new HookRunner(this.processRunner, this.terminal);
    const reporter = new SandboxReporter(workspace, this.terminal);
    const portProbe = new PortProbe();
    const secretGenerator = new SecretGenerator();
    const templateRenderer = new TemplateRenderer();

    const synchronizer = new SandboxSynchronizer({
      workspace,
      environmentFileWriter: new EnvironmentFileWriter(templateRenderer),
      hookRunner,
      terminal: this.terminal,
    });
    const creator = new SandboxCreator({
      workspace,
      clones,
      synchronizer,
      hookRunner,
      secretGenerator,
      portProbe,
      terminal: this.terminal,
    });
    const remover = new SandboxRemover({ workspace, clones, terminal: this.terminal });
    const inspector = new SetupInspector({
      workspace,
      clones,
      portProbe,
      secretGenerator,
      templateRenderer,
      dockerAvailability,
    });

    return new Map([
      ['create', new CreateCommand({ workspace, creator, clones, reporter, terminal: this.terminal })],
      ['sync', new SyncCommand({ workspace, synchronizer, reporter, terminal: this.terminal })],
      ['list', new ListCommand({ workspace, terminal: this.terminal })],
      ['info', new InfoCommand({ workspace, reporter })],
      ['up', new UpCommand({ workspace, reporter, terminal: this.terminal })],
      ['down', new DownCommand({ workspace, terminal: this.terminal })],
      ['seed', new SeedCommand({ workspace, hookRunner, terminal: this.terminal })],
      ['run', new RunCommand({ workspace, processRunner: this.processRunner })],
      ['open', new OpenCommand({ workspace, terminal: this.terminal })],
      ['code', new CodeCommand({ workspace, processRunner: this.processRunner })],
      ['delete', new DeleteCommand({ workspace, remover, terminal: this.terminal })],
      ['doctor', new DoctorCommand({ inspector, terminal: this.terminal })],
      ['init', this.buildInit()],
    ]);
  }

  buildInit() {
    return new InitCommand({
      scaffolder: new ManifestScaffolder(new EcosystemCatalog()),
      terminal: this.terminal,
    });
  }
}
