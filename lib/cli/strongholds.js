const _ = require('lodash');
const common = require('@screeps/common');
const C = common.configManager.config.common.constants;
const db = common.storage.db;
const utils = require('../utils');
const q = require('q');
const strongholds = require('../strongholds');

exports.spawn = utils.withHelp([
    `spawn(roomName, [opts]) - Create a new NPC Stronghold, and spawn it to the specified room. 'opts' is an object with the following optional properties:\r
    * templateName - the name of stronghold template to spawn, default is random\r
    * x - the X position of the spawn in the room, default is random\r
    * y - the Y position of the spawn in the room, default is random\r
    * user - id of user which stronghold structures should belong to, default is "2" (Invader)`,
    function spawn(roomName, opts) {
        opts = opts || {};
        try{
            return strongholds.spawnStronghold(roomName, opts);
        }
        catch(e) {
            return q.reject(e);
        }
    }
]);

exports._help = utils.generateCliHelp('bots.', exports)+`\r\nStrongholds:\r\n`+
    Object.keys(strongholds.templates).map(n => ` - ${n} [${strongholds.templates[n].description}]`).join(`\r\n`);
