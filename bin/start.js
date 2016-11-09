#!/usr/bin/env node
require('../lib/index').start();
process.on('disconnect', () => process.exit());