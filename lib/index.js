var q = require('q'),
    _ = require('lodash'),
    net = require('net'),
    EventEmitter = require('events').EventEmitter,
    common = require('@screeps/common'),
    config = Object.assign(common.configManager.config, {backend: new EventEmitter(), cli: new EventEmitter()}),
    cliServer = require('./cli/server'),
    gameServer = require('./game/server'),
    cronjobs = require('./cronjobs'),
    utils = require('./utils');

module.exports.start = function() {

    common.configManager.load();

    common.storage._connect()
    .then(() => cliServer.startServer())
    .then(() => gameServer.startServer())
    .then(() => {
        setInterval(cronjobs.run, 1000);
        for(let i in config.common.bots) {
            utils.reloadBotUsers(i).catch(e => console.error(`Couldn't reload bot AI "${i}": ${e}`));
        }
    })
    .catch(err => {
        console.error(err);
        process.exit();
    });

    setInterval(() => {
        var rejections = q.getUnhandledReasons();
        rejections.forEach((i) => console.error('Unhandled rejection:', i));
        q.resetUnhandledRejections();
    }, 1000);

};