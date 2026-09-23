// Kept as the portable newsroom entry point for existing integrations.
import { execFileSync } from 'node:child_process';
execFileSync('python3', ['scripts/update-news.py'], { stdio: 'inherit' });
