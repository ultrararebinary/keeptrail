const base = 'http://127.0.0.1:4317';
const id = process.argv[2];
if (id && !/^[0-9a-f-]{36}$/i.test(id)) {
  process.stderr.write('Pass a source UUID from its Processing section, or omit it for app diagnostics.\n');
  process.exit(1);
}
try {
  const response = await fetch(`${base}${id ? `/api/items/${id}/diagnostics` : '/api/diagnostics'}`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Diagnostics request failed (${response.status}).`);
  process.stdout.write(`${JSON.stringify(await response.json(), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Diagnostics unavailable.'} Start Keeptrail with npm start first.\n`);
  process.exitCode = 1;
}
