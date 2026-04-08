import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'bq-write');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface GlobalConfig {
  anthropicApiKey?: string;
  openaiApiKey?: string;
}

export function loadGlobalConfig(): GlobalConfig {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as GlobalConfig;
  } catch {
    return {};
  }
}

export function saveGlobalConfig(config: GlobalConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function configFilePath(): string {
  return CONFIG_FILE;
}
