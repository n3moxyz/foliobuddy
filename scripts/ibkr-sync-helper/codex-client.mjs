import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';

export const READ_TOOLS = Object.freeze({
  positions: 'interactive_brokers_ibkr.get_account_positions',
  balances: 'interactive_brokers_ibkr.get_account_balances',
  summary: 'interactive_brokers_ibkr.get_account_summary',
  executions: 'interactive_brokers_ibkr.get_account_trades',
});

/** Fixed read-only RPC client. Never starts a model turn or accepts a web-supplied tool. */
export class CodexClient {
  constructor(binary = 'codex', cwd = process.cwd()) {
    this.binary = binary;
    this.cwd = cwd;
    this.pending = new Map();
    this.sequence = 0;
  }

  async connect() {
    this.process = spawn(this.binary, ['app-server', '--stdio'], {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Runtime diagnostics may contain account information. Do not persist or print them.
    this.process.stderr.resume();
    this.process.stdin.on('error', () => this.fail('The Codex connection closed. Try again.'));
    this.process.on('error', () => this.fail('Codex could not start. Open Codex and try again.'));
    this.process.on('exit', () => this.fail('The Codex connection closed. Try again.'));
    this.lines = createInterface({ input: this.process.stdout });
    this.lines.on('line', (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.method && message.id != null) {
        this.send({
          id: message.id,
          error: { code: -32000, message: 'This read-only helper cannot grant permissions.' },
        });
        this.fail('IBKR needs attention in Codex. Reconnect there, then try again.');
      } else if (message.id != null) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) {
          pending.reject(
            new Error('Codex could not complete the IBKR read. Check its connection.')
          );
        } else pending.resolve(message.result);
      }
    });
    await this.rpc('initialize', {
      clientInfo: {
        name: 'foliobuddy_ibkr_helper',
        title: 'FolioBuddy IBKR sync',
        version: '1.0.0',
      },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: 'initialized', params: {} });
    const installed = await this.rpc('app/installed', { forceRefresh: true });
    const matches = installed?.apps?.filter((app) =>
      /interactive.*brokers|ibkr/i.test(`${app.id} ${app.runtimeName}`)
    );
    if (matches?.length !== 1 || !matches[0].enabled || !matches[0].callable) {
      throw new Error('Connect the Interactive Brokers plugin in Codex first.');
    }
    const context = await this.rpc('thread/start', {
      cwd: this.cwd,
      ephemeral: true,
      sandbox: 'read-only',
    });
    this.threadId = context?.thread?.id;
    if (!this.threadId) throw new Error('Codex did not provide a read-only connection.');
    const inventory = await this.rpc('mcpServerStatus/list', {
      threadId: this.threadId,
      serverName: 'codex_apps',
      detail: 'toolsAndAuthOnly',
      limit: 10,
    });
    if (inventory?.nextCursor) throw new Error('The IBKR tool inventory is incomplete.');
    const server = inventory?.data?.find((entry) => entry.name === 'codex_apps');
    const identities = Object.values(READ_TOOLS).map((name) => {
      const tool = server?.tools?.[name];
      const meta = tool?._meta;
      if (
        tool?.name !== name ||
        tool.annotations?.readOnlyHint !== true ||
        tool.annotations?.destructiveHint !== false ||
        meta?.connector_id !== matches[0].id ||
        !meta?.link_id
      )
        throw new Error('A required read-only IBKR tool is unavailable. Reconnect in Codex.');
      return `${meta.connector_id}:${meta.link_id}`;
    });
    if (new Set(identities).size !== 1)
      throw new Error('IBKR tools refer to different connections.');
    this.fingerprint = createHash('sha256').update(identities[0]).digest('hex');
    return this.fingerprint;
  }

  send(message) {
    if (this.process?.stdin.writable) this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  rpc(method, params) {
    if (this.failed) return Promise.reject(new Error(this.failed));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('The IBKR connection timed out. No further changes will be made.'));
      }, 45000);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }

  async read(kind) {
    const tool = READ_TOOLS[kind];
    if (!tool || !this.threadId) throw new Error('Unsupported broker read.');
    return this.rpc('mcpServer/tool/call', {
      threadId: this.threadId,
      server: 'codex_apps',
      tool,
      arguments: kind === 'executions' ? { period: 'DAYS_90' } : {},
    });
  }

  fail(message) {
    this.failed = message;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }

  close() {
    this.fail('The IBKR connection is closed.');
    this.lines?.close();
    this.process?.kill('SIGTERM');
    const child = this.process;
    const timer = setTimeout(() => {
      if (child?.exitCode === null) child.kill('SIGKILL');
    }, 1000);
    timer.unref();
  }
}
