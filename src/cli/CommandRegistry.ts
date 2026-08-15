import { EnvironmentFileWriter } from '@/application/EnvironmentFileWriter.js';
import { HookRunner } from '@/application/HookRunner.js';
import { ManifestScaffolder } from '@/application/ManifestScaffolder.js';
import { ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { SandboxCreator } from '@/application/SandboxCreator.js';
import { SandboxRebuilder } from '@/application/SandboxRebuilder.js';
import { SandboxResolver } from '@/application/SandboxResolver.js';
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
 * Two kinds of command exist:
 *
 * - Per-sandbox operations (`info`, `up`, `down`, `run`, `open`, `code`,
 *   `delete`) address a specific sandbox by name and can run from any
 *   directory: they resolve the sandbox through `SandboxResolver`, which
 *   scans `~/.sbx`, and build their workspace from the resolved
 *   sandbox's host project. They are wired identically whether or not
 *   the tool was invoked inside a project; the only difference is the
 *   `preferredProject` the resolver uses to break bare-name ties.
 *
 * - Project-scoped operations (`create`, `rebuild`, `doctor`) act on the
 *   host checkout itself, so they only exist in `forProject`.
 */
export class CommandRegistry {
  private readonly terminal: Terminal;
  private readonly processRunner: ProcessRunner;
  private readonly homePath: HomePath;
  private readonly dockerAvailability: DockerAvailability;

  constructor({ terminal, processRunner, homePath }: CommandRegistryDeps) {
    this.terminal = terminal;
    this.processRunner = processRunner;
    this.homePath = homePath;
    this.dockerAvailability = new DockerAvailability(processRunner);
  }

  /**
   * Commands that work in any directory, with no project context. Used
   * when no manifest was found or when the manifest failed to load — the
   * per-sandbox operations reach the target through `~/.sbx` regardless
   * of where sbx was invoked from.
   */
  standalone(): Map<string, Command> {
    const resolver = new SandboxResolver(this.homePath, this.processRunner, this.dockerAvailability, null);
    // preferredWorkspace is null: bare-name lookups have no local project to prefer, and every resolution is global.
    return new Map<string, Command>([
      ['init', this.buildInit()],
      ['list', new ListCommand({ workspace: null, homePath: this.homePath, terminal: this.terminal })],
      ...this.perSandboxCommands(resolver),
    ]);
  }

  /** Every command, wired against one project. */
  forProject(manifest: ProjectManifest): Map<string, Command> {
    const clones = new GitClones(this.processRunner, manifest.rootDirectory);
    const workspace = new ProjectWorkspace(manifest, this.homePath, this.processRunner, this.dockerAvailability, clones);
    const hookRunner = new HookRunner(this.processRunner, this.terminal);
    const reporter = new SandboxReporter(workspace, this.terminal);
    const portProbe = new PortProbe();
    const secretGenerator = new SecretGenerator();
    const templateRenderer = new TemplateRenderer();
    const resolver = new SandboxResolver(this.homePath, this.processRunner, this.dockerAvailability, workspace);

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
    const inspector = new SetupInspector({
      workspace,
      clones,
      portProbe,
      secretGenerator,
      templateRenderer,
      dockerAvailability: this.dockerAvailability,
    });

    return new Map<string, Command>([
      ['create', new CreateCommand({ workspace, creator, clones, reporter, terminal: this.terminal })],
      ['rebuild', new RebuildCommand({ workspace, rebuilder, reporter, terminal: this.terminal })],
      ['list', new ListCommand({ workspace, homePath: this.homePath, terminal: this.terminal })],
      ['doctor', new DoctorCommand({ inspector, terminal: this.terminal })],
      ['init', this.buildInit()],
      ...this.perSandboxCommands(resolver),
    ]);
  }

  private perSandboxCommands(resolver: SandboxResolver): [string, Command][] {
    return [
      ['info', new InfoCommand({ resolver, terminal: this.terminal })],
      ['up', new UpCommand({ resolver, terminal: this.terminal })],
      ['down', new DownCommand({ resolver, terminal: this.terminal })],
      ['run', new RunCommand({ resolver, processRunner: this.processRunner })],
      ['open', new OpenCommand({ resolver, processRunner: this.processRunner, terminal: this.terminal })],
      ['code', new CodeCommand({ resolver, processRunner: this.processRunner })],
      ['delete', new DeleteCommand({ resolver, terminal: this.terminal })],
    ];
  }

  private buildInit(): Command {
    return new InitCommand({
      scaffolder: new ManifestScaffolder(new EcosystemCatalog()),
      terminal: this.terminal,
    });
  }
}
