// Writes a seccomp profile that lets Chrome use its own sandbox inside the
// container: Docker's default profile for your Docker version, plus the
// three namespace syscalls the sandbox needs (clone/unshare/setns).
//
//   node deploy/make-chrome-seccomp.mjs 26.1.0 > chrome-seccomp.json
//
// Use it with CHROME_SANDBOX=true - see README, "Chrome sandbox".
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('usage: node deploy/make-chrome-seccomp.mjs <docker version, e.g. 26.1.0>');
  process.exit(1);
}

const url = `https://raw.githubusercontent.com/moby/moby/v${version}/profiles/seccomp/default.json`;
const response = await fetch(url);
if (!response.ok) {
  console.error(`Could not download ${url}: HTTP ${response.status}`);
  process.exit(1);
}

const profile = await response.json();
profile.syscalls.push({
  names: ['clone', 'unshare', 'setns'],
  action: 'SCMP_ACT_ALLOW',
  comment: `update-day: Chrome's sandbox creates user/pid/net namespaces. Everything else is Docker's default profile (moby v${version}).`,
});
process.stdout.write(`${JSON.stringify(profile, null, 1)}\n`);
