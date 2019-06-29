const common = require('@screeps/common');
const C = common.configManager.config.common.constants;
const bots = common.configManager.config.common.bots;
const db = common.storage.db;
const env = common.storage.env;
const utils = require('../utils');
const q = require('q');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');

var boyNames = [ 'Jackson', 'Aiden', 'Liam', 'Lucas', 'Noah', 'Mason', 'Jayden', 'Ethan', 'Jacob', 'Jack', 'Caden', 'Logan', 'Benjamin', 'Michael', 'Caleb', 'Ryan', 'Alexander', 'Elijah', 'James', 'William', 'Oliver', 'Connor', 'Matthew', 'Daniel', 'Luke', 'Brayden', 'Jayce', 'Henry', 'Carter', 'Dylan', 'Gabriel', 'Joshua', 'Nicholas', 'Isaac', 'Owen', 'Nathan', 'Grayson', 'Eli', 'Landon', 'Andrew', 'Max', 'Samuel', 'Gavin', 'Wyatt', 'Christian', 'Hunter', 'Cameron', 'Evan', 'Charlie', 'David', 'Sebastian', 'Joseph', 'Dominic', 'Anthony', 'Colton', 'John', 'Tyler', 'Zachary', 'Thomas', 'Julian', 'Levi', 'Adam', 'Isaiah', 'Alex', 'Aaron', 'Parker', 'Cooper', 'Miles', 'Chase', 'Muhammad', 'Christopher', 'Blake', 'Austin', 'Jordan', 'Leo', 'Jonathan', 'Adrian', 'Colin', 'Hudson', 'Ian', 'Xavier', 'Camden', 'Tristan', 'Carson', 'Jason', 'Nolan', 'Riley', 'Lincoln', 'Brody', 'Bentley', 'Nathaniel', 'Josiah', 'Declan', 'Jake', 'Asher', 'Jeremiah', 'Cole', 'Mateo', 'Micah', 'Elliot' ],
    girlNames = [ 'Sophia', 'Emma', 'Olivia', 'Isabella', 'Mia', 'Ava', 'Lily', 'Zoe', 'Emily', 'Chloe', 'Layla', 'Madison', 'Madelyn', 'Abigail', 'Aubrey', 'Charlotte', 'Amelia', 'Ella', 'Kaylee', 'Avery', 'Aaliyah', 'Hailey', 'Hannah', 'Addison', 'Riley', 'Harper', 'Aria', 'Arianna', 'Mackenzie', 'Lila', 'Evelyn', 'Adalyn', 'Grace', 'Brooklyn', 'Ellie', 'Anna', 'Kaitlyn', 'Isabelle', 'Sophie', 'Scarlett', 'Natalie', 'Leah', 'Sarah', 'Nora', 'Mila', 'Elizabeth', 'Lillian', 'Kylie', 'Audrey', 'Lucy', 'Maya', 'Annabelle', 'Makayla', 'Gabriella', 'Elena', 'Victoria', 'Claire', 'Savannah', 'Peyton', 'Maria', 'Alaina', 'Kennedy', 'Stella', 'Liliana', 'Allison', 'Samantha', 'Keira', 'Alyssa', 'Reagan', 'Molly', 'Alexandra', 'Violet', 'Charlie', 'Julia', 'Sadie', 'Ruby', 'Eva', 'Alice', 'Eliana', 'Taylor', 'Callie', 'Penelope', 'Camilla', 'Bailey', 'Kaelyn', 'Alexis', 'Kayla', 'Katherine', 'Sydney', 'Lauren', 'Jasmine', 'London', 'Bella', 'Adeline', 'Caroline', 'Vivian', 'Juliana', 'Gianna', 'Skyler', 'Jordyn' ];

function genRandomUserName(c) {
    c = c || 0;

    var name;


    var list = Math.random() > 0.5 ? boyNames : girlNames;
    name = list[Math.floor(Math.random()*list.length)];

    if(c > 3) {
        name += list[Math.floor(Math.random()*list.length)];
    }

    return db.users.findOne({username: name+'Bot'})
        .then(result => {
            if(result) {
                return genRandomUserName(c+1);
            }
            return name+'Bot';
        });
}

function genRandomBadge() {
    var badge = {};
    badge.type = Math.floor(Math.random()*24)+1;
    badge.color1 = '#'+Math.floor(Math.random()*0xffffff).toString(16);
    badge.color2 = '#'+Math.floor(Math.random()*0xffffff).toString(16);
    badge.color3 = '#'+Math.floor(Math.random()*0xffffff).toString(16);
    badge.flip = Math.random() > 0.5;
    badge.param = Math.floor(Math.random()*200) - 100;
    return badge;
}

exports.spawn = utils.withHelp([
    `spawn(botAiName, roomName, [opts]) - Create a new NPC player with bot AI scripts, and spawn it to the specified room. 'opts' is an object with the following optional properties:\r
    * username - the name of a bot player, default is randomly generated\r
    * cpu - the CPU limit of a bot user, default is 100\r
    * gcl - the Global Control Level of a bot user, default is 1\r
    * x - the X position of the spawn in the room, default is random\r
    * y - the Y position of the spawn in the room, default is random`,
    function spawn(botAiName, roomName, opts) {
        opts = opts || {};
        try {
            var modules = utils.loadBot(botAiName), user;
            return db['rooms.objects'].findOne({$and: [{room: roomName}, {type: 'controller'}]})
                .then(controller => {
                    if(!controller) {
                        return q.reject(`Room controller not found in ${roomName}`);
                    }
                    if(controller.user) {
                        return q.reject(`Room ${roomName} is already owned`);
                    }
                })
                .then(() => !opts.username ? genRandomUserName() :
                    db.users.findOne({username: opts.username}).then(user => user ? q.reject(`User with the name "${opts.username}" already exists`) : opts.username))
                .then(username => {
                    var _user = {
                        username,
                        usernameLower: username.toLowerCase(),
                        cpu: opts.cpu || 100,
                        gcl: opts.gcl ? C.GCL_MULTIPLY * Math.pow(opts.gcl - 1, C.GCL_POW) : 0,
                        cpuAvailable: 0,
                        registeredDate: new Date(),
                        bot: botAiName,
                        active: 10000,
                        badge: genRandomBadge()
                    };
                    return db.users.insert(_user);
                })
                .then(_user => {
                    user = _user;
                    return db['users.code'].insert({
                        user: user._id,
                        modules,
                        branch: 'default',
                        activeWorld: true,
                        activeSim: true
                    });
                })
                .then(() => env.set(env.keys.MEMORY+user._id, "{}"))
                .then(() => db['rooms.terrain'].findOne({room: roomName}))
                .then(terrainItem => {
                    var x = opts.x || Math.floor(3 + Math.random()*46);
                    var y = opts.y || Math.floor(3 + Math.random()*46);
                    while(common.checkTerrain(terrainItem.terrain, x, y, C.TERRAIN_MASK_WALL)) {
                        x = Math.floor(3 + Math.random()*46);
                        y = Math.floor(3 + Math.random()*46);
                    }
                    return db['rooms.objects'].insert({
                        type: 'spawn',
                        room: roomName,
                        x,
                        y,
                        name: 'Spawn1',
                        user: user._id,
                        store: { energy: C.SPAWN_ENERGY_START },
                        storeCapacityResource: { energy: C.SPAWN_ENERGY_CAPACITY },
                        hits: C.SPAWN_HITS,
                        hitsMax: C.SPAWN_HITS,
                        spawning: null,
                        notifyWhenAttacked: false
                    });
                })
                .then(common.getGametime)
                .then(gameTime => db['rooms.objects'].update({$and: [{room: roomName}, {type: 'controller'}]}, {$set: {
                    user: user._id, level: 1, progress: 0, downgradeTime: null, safeMode: gameTime + 20000
                }}))
                .then(() => db.rooms.update({_id: roomName}, {$set: {active: true, invaderGoal: 1000000}}))
                .then(() => `User ${user.username} with bot AI "${botAiName}" spawned in ${roomName}`);
        }
        catch(e) {
            return q.reject(e);
        }
    }
]);

exports.reload = utils.withHelp([
    "reload(botAiName) - Reload scripts for the specified bot AI.",
    function reload(botAiName) {
        return utils.reloadBotUsers(botAiName);
    }
]);

exports.removeUser = utils.withHelp([
    "removeUser(username) - Delete the specified bot player and all its game objects.",
    function removeUser(username) {
        return db.users.findOne({username})
            .then(user => {
                if(!user) {
                    return q.reject('User not found');
                }
                if(!user.bot) {
                    return q.reject('User is not a bot');
                }
                return utils.respawnUser(user._id)
                    .then(db.users.removeWhere({_id: user._id}))
                    .then(db['users.code'].removeWhere({user: user._id}))
                    .then(env.del(env.keys.MEMORY+user._id))
                    .then(() => `User removed successfully`);
            })
    }
]);

exports._help = utils.generateCliHelp('bots.', exports)+`\r\nBot AIs:\r\n`+
    Object.keys(bots).map(botName => ` - ${botName} [${bots[botName]}]`).join(`\r\n`);
