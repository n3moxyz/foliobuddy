import { readFileSync } from 'node:fs';
import ts from 'typescript';

const SHARED_FILE = 'packages/shared/src/types.ts';
const BACKEND_FILE = 'packages/backend/src/lib/constants.ts';

const EXPORTED_VALUES = [
  'USD_SGD_FALLBACK_RATE',
  'MAX_POSITIONS_PER_CATEGORY',
  'AssetCategory',
  'ASSET_CATEGORIES',
  'StorageType',
  'STORAGE_TYPES',
  'TradeDirection',
  'TRADE_DIRECTIONS',
  'TradeStatus',
  'TRADE_STATUSES',
  'SnapshotType',
  'SNAPSHOT_TYPES',
  'SnapshotSource',
  'STABLECOIN_CATEGORIES',
  'CategoryGroup',
  'CATEGORIES_IN_GROUP',
  'PriceProvider',
  'PriceSource',
];

const EXPORTED_FUNCTION_BODIES = ['categoryGroup'];

function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function exportedModifier(statement) {
  return statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function collectExports(fileName) {
  const sourceText = readFileSync(fileName, 'utf8');
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const values = new Map();
  const functions = new Map();

  for (const statement of sourceFile.statements) {
    if (!exportedModifier(statement)) continue;

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        values.set(declaration.name.text, normalize(declaration.initializer.getText(sourceFile)));
      }
    }

    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      functions.set(statement.name.text, normalize(statement.body.getText(sourceFile)));
    }
  }

  return { values, functions };
}

const shared = collectExports(SHARED_FILE);
const backend = collectExports(BACKEND_FILE);
const failures = [];

for (const name of EXPORTED_VALUES) {
  const sharedValue = shared.values.get(name);
  const backendValue = backend.values.get(name);
  if (!sharedValue || !backendValue) {
    failures.push(`${name}: missing from ${!sharedValue ? SHARED_FILE : BACKEND_FILE}`);
    continue;
  }
  if (sharedValue !== backendValue) {
    failures.push(`${name}: backend constant differs from shared constant`);
  }
}

for (const name of EXPORTED_FUNCTION_BODIES) {
  const sharedBody = shared.functions.get(name);
  const backendBody = backend.functions.get(name);
  if (!sharedBody || !backendBody) {
    failures.push(`${name}: missing from ${!sharedBody ? SHARED_FILE : BACKEND_FILE}`);
    continue;
  }
  if (sharedBody !== backendBody) {
    failures.push(`${name}: backend function body differs from shared function body`);
  }
}

if (failures.length > 0) {
  console.error('Domain constants drift detected:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Domain constants match between shared and backend.');
