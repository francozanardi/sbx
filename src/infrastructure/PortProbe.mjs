import net from 'node:net';

/**
 * Checks whether a TCP port can still be bound on the loopback interface.
 *
 * This catches ports held by anything on the machine, including processes
 * this tool knows nothing about. It cannot see a sandbox that is merely
 * registered but not running — that case is answered from the registry.
 */
export class PortProbe {
  async isFree(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => server.close(() => resolve(true)));
      server.listen(port, '127.0.0.1');
    });
  }

  /** Subset of the given ports that something is already listening on. */
  async findTaken(ports) {
    const taken = [];
    for (const port of ports) {
      if (!(await this.isFree(port))) taken.push(port);
    }
    return taken;
  }
}
