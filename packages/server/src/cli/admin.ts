/**
 * Admin bootstrap CLI.
 *
 * `ADMIN_EMAILS` is the ambient way to seed the first admin — those addresses
 * are auto-provisioned on their first SSO sign-in — but it needs env config and
 * a restart, and it keeps re-promoting anyone in the list. This CLI is the
 * imperative path: a one-shot command that creates or promotes a user, then
 * stays out of the way.
 *
 * Usage:
 *   npm run admin -w @wikitail/server -- add <email>
 *   npm run admin -w @wikitail/server -- list
 *
 * In production, run it inside the container against the mounted DB:
 *   podman exec wikitail npx --no-install tsx packages/server/src/cli/admin.ts add me@example.org
 *
 * Migrations run at import time via `db/connection.ts`, so on a fresh install
 * the first run of this CLI also creates the schema.
 */

// The DB connection has to be established (and migrations applied) before any
// repository is imported. Keep this the first import.
import './../db/connection.js';
import { usersRepository } from '../modules/users/repository.js';

type Command = 'add' | 'list' | 'help';

function parseArgs(argv: string[]): { command: Command; args: string[] } {
  const [raw, ...rest] = argv;
  if (!raw || raw === 'help' || raw === '--help' || raw === '-h') {
    return { command: 'help', args: rest };
  }
  if (raw === 'add' || raw === 'list') {
    return { command: raw, args: rest };
  }
  return { command: 'help', args: [raw, ...rest] };
}

function usage(): string {
  return [
    'wikitail admin — manage administrator accounts',
    '',
    'Commands:',
    '  add <email>    Create the user (if new) and set their role to admin.',
    '                 Also promotes an existing author to admin.',
    '  list           Show every user and their role.',
    '  help           Show this message.',
    '',
    'Environment:',
    '  DB_PATH        Path to the SQLite file. Defaults to ./data/wikitail.db',
    '                 relative to the server package.',
  ].join('\n');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function add(email: string | undefined): number {
  if (!email) {
    console.error('Missing email. Try: admin add name@example.org');
    return 2;
  }
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    console.error(`"${email}" does not look like an email address.`);
    return 2;
  }

  const existing = usersRepository.findByEmail(normalized);
  if (existing) {
    if (existing.role === 'admin') {
      console.log(`${normalized} is already an admin.`);
      return 0;
    }
    usersRepository.updateRole(existing.id, 'admin');
    console.log(`Promoted ${normalized} to admin.`);
    return 0;
  }

  usersRepository.upsertByEmail(normalized, 'admin');
  console.log(`Created ${normalized} as admin.`);
  return 0;
}

function list(): number {
  const users = usersRepository.list();
  if (users.length === 0) {
    console.log('No users yet.');
    return 0;
  }
  const width = Math.max(...users.map((u) => u.email.length));
  for (const user of users) {
    console.log(`${user.email.padEnd(width)}  ${user.role}`);
  }
  return 0;
}

const { command, args } = parseArgs(process.argv.slice(2));

let exitCode: number;
switch (command) {
  case 'add':
    exitCode = add(args[0]);
    break;
  case 'list':
    exitCode = list();
    break;
  case 'help':
  default:
    console.log(usage());
    exitCode = args.length > 0 ? 2 : 0;
    break;
}

process.exit(exitCode);
