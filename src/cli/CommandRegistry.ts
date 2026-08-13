import { EnvironmentFileWriter } from '@/application/EnvironmentFileWriter.js';
import { HookRunner } from '@/application/HookRunner.js';
import { ManifestScaffolder } from '@/application/ManifestScaffolder.js';
import { ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { SandboxCreator } from '@/application/SandboxCreator.js';
import { SandboxRebuilder } from '@/application/SandboxRebuilder.js';
import { SandboxRemover } from '@/application/SandboxRemover.js';
import { SetupInspector } from '@/application/SetupInspector.js';
import { CodeCommand } from '@/commands/CodeCommand.js';
import { CreateCommand } from '@/commands/CreateCommand.js';
import { DeleteCommand } from '@/commands/DeleteCommand.js';
import { DoctorCommand } from '@/commands/DoctorCommand.js';
import { DownCommand } from '@/commands/DownCommand.js';
import { InfoCommand } from '@/commands/InfoCommand.js';
import { InitCommand } from '@/commands/InitCommand.js';
import { ListCommand } from '@/commands/ListCommand.js';
import { OpenCommand } from '@/commands/OpenCommand.js';
import { RebuildCommand } from '@/commands/RebuildCommand.js';
import { RunCommand } from '@/commands/RunCommand.js';
import { UpCommand } from '@/commands/UpCommand.js';
import { EcosystemCatalog } from '@/domain/EcosystemCatalog.js';
import { type ProjectManifest } from '@/domain/ProjectManifest.js';
import { DockerAvailability } from '@/infrastructure/DockerAvailability.js';
import { GitClones } from '@/infrastructure/GitClones.js';
import { type HomePath } from '@/infrastructure/HomePath.js';
import { PortProbe } from '@/infrastructure/PortProbe.js';
import { type ProcessRunner } from '@/infrastructure/ProcessRunner.js';
import { SecretGenerator } from '@/infrastructure/SecretGenerator.js';
import { TemplateRenderer } from '@/infrastructure/TemplateRenderer.js';
import { type Command } from '@/cli/CommandRouter.js';
import { SandboxReporter } from '@/cli/SandboxReporter.js';
import { type Terminal } from '@/cli/Terminal.js';

export interface CommandRegistryDeps {
  terminal: Terminal;
  processRunner: ProcessRunner;
  homePath: HomePath;
}

/**
 * Builds the commands and everything they depend on.
 *
 * The split is between commands that need a project manifest and the one
 * that exists to create it: `init` has to work in a directory that has no
 * manifest yet, which is the only reason it is separated.
 */
export class CommandRegistry {
  private readonly terminal: Terminal;
  private readonly processRunner: ProcessRunner;
  private readonly homePath: HomePath;

  constructor({ terminal, processRunner, homePath }: CommandRegistryDeps) {
    this.terminal = terminal;
    this.processRunner = processRunner;
    this.homePath = homePath;
  }

  /** Commands that work in any directory. */
  standalone(): Map<string, Command> {
    return new Map<string, Command>([['init', this.buildInit()]]);
  }

  /** Every command, wired against one project. */
  forProject(manifest: ProjectManifest): Map<string, Command> {
    const dockerAvailability = new DockerAvailability(this.processRunner);
    const clones = new GitClones(this.processRunner, manifest.rootDirectory);
    const workspace = new ProjectWorkspace(manifest, this.homePath, this.processRunner, dockerAvailability, clones);
    const hookRunner = new HookRunner(this.processRunner, this.terminal);
    const reporter = new SandboxReporter(workspace, this.terminal);
    const portProbe = new PortProbe();
    const secretGenerator = new SecretGenerator();
    const templateRenderer = new TemplateRenderer();

    const rebuilder = new SandboxRebuilder({
      workspace,
      environmentFileWriter: new EnvironmentFileWriter(templateRenderer),
      hookRunner,
      terminal: this.terminal,
    });
    const creator = new SandboxCreator({
      workspace,
      clones,
      rebuilder,
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

    return new Map<string, Command>([
      ['create', new CreateCommand({ workspace, creator, clones, reporter, terminal: this.terminal })],
      ['rebuild', new RebuildCommand({ workspace, rebuilder, reporter, terminal: this.terminal })],
      ['list', new ListCommand({ workspace, terminal: this.terminal })],
      ['info', new InfoCommand({ workspace, reporter })],
      ['up', new UpCommand({ workspace, reporter, terminal: this.terminal })],
      ['down', new DownCommand({ workspace, terminal: this.terminal })],
      ['run', new RunCommand({ workspace, processRunner: this.processRunner })],
      ['open', new OpenCommand({ workspace, terminal: this.terminal })],
      ['code', new CodeCommand({ workspace, processRunner: this.processRunner })],
      ['delete', new DeleteCommand({ workspace, remover, terminal: this.terminal })],
      ['doctor', new DoctorCommand({ inspector, terminal: this.terminal })],
      ['init', this.buildInit()],
    ]);
  }

  private buildInit(): Command {
    return new InitCommand({
      scaffolder: new ManifestScaffolder(new EcosystemCatalog()),
      terminal: this.terminal,
    });
  }
}
