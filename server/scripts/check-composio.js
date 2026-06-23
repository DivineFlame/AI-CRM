import 'dotenv/config';
import { getGmailConfigurationStatus } from '../composio.js';

const status = await getGmailConfigurationStatus();
console.log(JSON.stringify(status, null, 2));

if (!status.apiKey || !status.authConfigId) {
  process.exitCode = 1;
}
