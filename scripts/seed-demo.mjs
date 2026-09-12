import { getDataDirectory, openDatabase, seedDemo, closeDatabase } from '../packages/core/dist/index.js';
const db = openDatabase(getDataDirectory()); seedDemo(db); closeDatabase(db); process.stdout.write('Demo fixtures seeded explicitly.\n');
