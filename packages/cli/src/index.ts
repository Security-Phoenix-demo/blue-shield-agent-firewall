#!/usr/bin/env node
/** @phoenix-security/cli — Phoenix Security Blue Shield - Firewall CLI */
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { installHooksCommand } from './commands/install-hooks.js';
import { scanCommand } from './commands/scan.js';
import { doctorCommand } from './commands/doctor.js';
import { rulesCommand } from './commands/rules.js';
import { inventoryCommand } from './commands/inventory.js';

const program = new Command();
program
  .name('phoenix-firewall')
  .description('Phoenix Security Blue Shield - Firewall CLI — protect your dependencies')
  .version('0.1.0');

program.addCommand(initCommand());
program.addCommand(installHooksCommand());
program.addCommand(scanCommand());
program.addCommand(doctorCommand());
program.addCommand(rulesCommand());
program.addCommand(inventoryCommand());

program.parse();
