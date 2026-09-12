/**
 * Regenerates docs/command-catalog.md from the command catalog the active
 * PrinterCommandProfile currently exposes (built-in commands only, no MQTT
 * connection required). Run this after changing a profile's command set so
 * the documentation cannot silently drift from the code:
 *
 *   pnpm --filter @cloudless/mqtt-puppeteer exec ts-node scripts/generate-command-catalog-doc.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAppConfig } from '../src/config/app-config';
import { FilamentCatalogService } from '../src/filaments/filament-catalog.service';
import { BambuLabA1CommandProfile } from '../src/printer-profiles/bambu-lab-a1/bambu-lab-a1-command.profile';
import type { CommandDefinition } from '../src/commands/command.types';

function renderParameters(definition: CommandDefinition): string {
  const entries = Object.entries(definition.parameters);
  if (entries.length === 0) return '_Brak parametrów._';

  const rows = entries.map(([name, parameter]) => {
    const constraints: string[] = [];
    if (parameter.required) constraints.push('wymagany');
    if (parameter.minimum !== undefined)
      constraints.push(`min ${parameter.minimum}`);
    if (parameter.maximum !== undefined)
      constraints.push(`max ${parameter.maximum}`);
    if (parameter.integer) constraints.push('całkowity');
    if (parameter.values)
      constraints.push(`jedno z: ${parameter.values.join(', ')}`);
    if (parameter.pattern) constraints.push(`wzorzec ${parameter.pattern}`);
    if (parameter.default !== undefined) {
      constraints.push(`domyślnie ${JSON.stringify(parameter.default)}`);
    }
    return `| \`${name}\` | \`${parameter.type}\` | ${constraints.join(', ') || '—'} | ${parameter.description ?? ''} |`;
  });

  return [
    '| Parametr | Typ | Ograniczenia | Opis |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function renderCommand(definition: CommandDefinition): string {
  const lines = [
    `### \`${definition.id}\``,
    '',
    definition.description,
    '',
    renderParameters(definition),
  ];
  if (definition.safetyNotes?.length) {
    lines.push('', '**Uwagi bezpieczeństwa:**');
    lines.push(...definition.safetyNotes.map((note) => `- ${note}`));
  }
  lines.push('', `_Źródło: \`${definition.source}\`_`, '');
  return lines.join('\n');
}

function main(): void {
  const config = loadAppConfig();
  const filaments = new FilamentCatalogService(config);
  const profile = new BambuLabA1CommandProfile(config, filaments);
  const commands = profile.getCommands();
  const envelope = profile.getMachineEnvelope();

  const doc = [
    '<!-- Wygenerowano automatycznie przez scripts/generate-command-catalog-doc.ts — nie edytuj ręcznie. -->',
    '',
    `# Katalog komend: profil \`${profile.id}\``,
    '',
    `Ten dokument odzwierciedla dokładnie to, co zwraca w runtime \`GET /commands\``,
    'dla aktualnie aktywnego profilu drukarki. Interaktywny, zawsze aktualny',
    'widok (wraz ze schematem OpenAPI) dostępny jest też pod `/docs`.',
    '',
    '## Bezpieczny zakres ruchu (`machineEnvelope`)',
    '',
    '| Oś | Minimum | Maksimum |',
    '| --- | --- | --- |',
    `| X | ${envelope.x.minimum} | ${envelope.x.maximum} |`,
    `| Y | ${envelope.y.minimum} | ${envelope.y.maximum} |`,
    `| Z | ${envelope.z.minimum} | ${envelope.z.maximum} |`,
    '',
    `## Komendy (${commands.length})`,
    '',
    ...commands.map(renderCommand),
  ].join('\n');

  const outputPath = resolve(__dirname, '../docs/command-catalog.md');
  writeFileSync(outputPath, doc, 'utf8');
  console.log(`Wygenerowano ${outputPath} (${commands.length} komend).`);
}

main();
