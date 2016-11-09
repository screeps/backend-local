var express = require('express'),
    router = express.Router(),
    q = require('q'),
    _ = require('lodash'),
    jsonResponse = require('q-json-response'),
    utils = require('./utils'),
    common = require('@screeps/common'),
    config = common.configManager.config,
    db = common.storage.db,
    env = common.storage.env,
    C = config.common.constants,
    tools = require('./tools');

config.cronjobs = {
    sendNotifications: [60, tools.sendNotifications],
    roomsForceUpdate: [20, tools.roomsForceUpdate],
    genPowerBanks: [5*60, tools.genPowerBanks],
    genInvaders: [5*60, tools.genInvaders],
    purgeTransactions: [60*60, tools.purgeTransactions],
    recreateNpcOrders: [5*60, tools.recreateNpcOrders],
    calcMarketStats: [60*60, tools.calcMarketStats]
};

module.exports.run = function() {
    _.forEach(config.cronjobs, (i,key) => {
        if(Date.now() - (i[2]||0) > i[0]*1000) {
            console.log(`Running cronjob '${key}'`);
            i[2] = Date.now();
            i[1]();
        }
    });
};