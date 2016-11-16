const util = require('util');
const common = require('@screeps/common');
const config = common.configManager.config;
const C = config.common.constants;
const db = common.storage.db;
const env = common.storage.env;
const pubsub = common.storage.pubsub;
const q = require('q');
const fs = require('fs');
const _ = require('lodash');
const zlib = require('zlib');
const utils = require('../utils');
const path = require('path');

exports.resetAllData = utils.withHelp([
    "resetAllData() - Wipe all world data and reset the database to the default state.",
    function resetAllData() {
        return common.storage.resetAllData();
    }
]);

exports.sendServerMessage = utils.withHelp([
    'sendServerMessage(message) - Send a text server message to all currently connected players.',
    function sendServerMessage(message) {
        return pubsub.publish('serverMessage', message);
    }
]);

exports.pauseSimulation = utils.withHelp([
    'pauseSimulation() - Stop main simulation loop execution.',
    function pauseSimulation() {
        return env.set(env.keys.MAIN_LOOP_PAUSED, '1').then(() => 'OK');
    }
]);

exports.resumeSimulation = utils.withHelp([
    'resumeSimulation() - Resume main simulation loop execution.',
    function resumeSimulation() {
        return env.set(env.keys.MAIN_LOOP_PAUSED, '0').then(() => 'OK');
    }
]);

exports.runCronjob = utils.withHelp([
    'runCronjob(jobName) - Run a cron job immediately.',
    function runCronjob(jobName) {
        if(!config.cronjobs[jobName]) {
            return q.reject(`Cronjob "${jobName}" not found`);
        }

        return q.when(config.cronjobs[jobName][1]()).then(() => 'OK');
    }
]);

exports._help = utils.generateCliHelp('system.', exports);