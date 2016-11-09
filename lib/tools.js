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
const utils = require('./utils');
const path = require('path');


function isBus(coord) {
    return coord < 0 && (coord+1) % 10 == 0 || coord > 0 && (coord) % 10 == 0 || coord == 0;
}

function isCenter(x,y) {
    return (x < 0 && Math.abs(x+1)%10 >= 4 && Math.abs(x+1)%10 <= 6 || x >= 0 && Math.abs(x)%10 >= 4 && Math.abs(x)%10 <= 6) &&
        (y < 0 && Math.abs(y+1)%10 >= 4 && Math.abs(y+1)%10 <= 6 || y >= 0 && Math.abs(y)%10 >= 4 && Math.abs(y)%10 <= 6);
}



exports.resetAllData = function resetAllData() {
    return common.storage.resetAllData();
};
exports.resetAllData._help = "resetAllData() - Wipe all world data and reset the database to the default state.";


exports.sendServerMessage = function sendServerMessage(message) {
    return pubsub.publish('serverMessage', message);
};
exports.sendServerMessage._help = 'sendServerMessage(message) - Send a text server message to all currently connected players.';

exports.pauseSimulation = function pauseSimulation() {
    return env.set(env.keys.MAIN_LOOP_PAUSED, '1').then(() => 'OK');
};
exports.pauseSimulation._help = 'pauseSimulation() - Stop main simulation loop execution.';

exports.resumeSimulation = function resumeSimulation() {
    return env.set(env.keys.MAIN_LOOP_PAUSED, '0').then(() => 'OK');
};
exports.resumeSimulation._help = 'resumeSimulation() - Resume main simulation loop execution.';


exports.updateTerrainData = function updateTerrainData() {

    var walled = '';
    for(var i=0; i<2500; i++) {
        walled += '1';
    }

    return q.all([
            db.rooms.find(),
            db['rooms.terrain'].find()
        ])
        .then(result => {
            var [rooms,terrain] = result;

            rooms.forEach(room => {
                if(room.status == 'out of borders') {
                    _.find(terrain, {room: room._id}).terrain = walled;
                }
                var m = room._id.match(/(W|E)(\d+)(N|S)(\d+)/);
                var roomH = m[1]+(+m[2]+1)+m[3]+m[4], roomV = m[1]+m[2]+m[3]+(+m[4]+1);
                if(!_.any(terrain, {room: roomH})) {
                    terrain.push({room: roomH, terrain: walled});
                }
                if(!_.any(terrain, {room: roomV})) {
                    terrain.push({room: roomV, terrain: walled});
                }
            });

            return q.ninvoke(zlib, 'deflate', JSON.stringify(terrain));
        })
        .then(compressed => env.set(env.keys.TERRAIN_DATA, compressed.toString('base64')))
        .then(() => 'OK');
};

exports.recreateNpcOrders = function recreateNpcOrders() {
    var gameTime;

    var sellMinerals = ['X','Z','K','L','U','O','O','H','H','Z','K','L','U','O','O','H','H'];
    var buyMinerals = ['X','Z','K','L','U','O','O','H','H','Z','K','L','U','O','O','H','H'];
    var sellPrice = {
        H: 3,
        O: 3,
        Z: 6,
        K: 6,
        U: 6,
        L: 6,
        X: 18
    };
    var buyPrice = 1;

    var sellMineralAmount = 40, sellEnergyAmount = 40, buyMineralAmount = 20, period = 5000;

    var cnt = 0;

    return common.getGametime()
        .then(data => gameTime = data)
        .then(() => db['rooms.objects'].find({$and: [{type: 'terminal'}, {user: {$eq: null}}]}))
        .then(terminals => common.qSequence(terminals, terminal => {
            return db.rooms.findOne({_id: terminal.room})
                .then(room => {
                    if(room.status != 'normal') {
                        return;
                    }
                    if(room.nextNpcMarketOrder && room.nextNpcMarketOrder > gameTime) {
                        return;
                    }
                    var sellMineral = sellMinerals[Math.floor(Math.random()*sellMinerals.length)];
                    var buyMineral = buyMinerals[Math.floor(Math.random()*buyMinerals.length)];
                    var orders = [];

                    orders.push({
                        created: gameTime,
                        active: true,
                        type: 'sell',
                        amount: period*sellMineralAmount,
                        remainingAmount: period*sellMineralAmount,
                        totalAmount: period*sellMineralAmount,
                        resourceType: sellMineral,
                        price: sellPrice[sellMineral],
                        roomName: terminal.room
                    });

                    if(Math.random() < 0.5) {
                        orders.push({
                            created: gameTime,
                            active: true,
                            type: 'sell',
                            amount: period*sellEnergyAmount,
                            remainingAmount: period*sellEnergyAmount,
                            totalAmount: period*sellEnergyAmount,
                            resourceType: 'energy',
                            price: 1,
                            roomName: terminal.room
                        });
                    }
                    if(Math.random() < 0.25) {
                        orders.push({
                            created: gameTime,
                            active: true,
                            type: 'buy',
                            amount: period*buyMineralAmount,
                            remainingAmount: period*buyMineralAmount,
                            totalAmount: period*buyMineralAmount,
                            resourceType: buyMineral,
                            price: buyPrice,
                            roomName: terminal.room
                        });
                    }
                    cnt++;
                    return db['market.orders'].removeWhere({roomName: room._id})
                        .then(() => db['market.orders'].insert(orders))
                        .then(() => db.rooms.update({_id: room._id}, {$set: {nextNpcMarketOrder: gameTime + Math.round(period*(0.8 + 0.4*Math.random()))}}));
                })
        }))
};

exports.sendNotifications = function sendNotifications() {

    var notifications, userIds;
    var filterDate = new Date();
    return db['users.notifications'].find({date: {$lt: filterDate.getTime()}})
        .then((data) => {
            notifications = data;
            userIds = _(notifications).pluck('user').uniq(false, (i) => i.toString()).value();
        })
        .then(() => db.users.find({_id: {$in: userIds}}))
        .then((users) => {
            var promise = q.when();
            users.forEach((user) => {

                var notificationIdsToRemove = [];

                promise = promise.then(() => {

                    var userNotifications = _.filter(notifications, (i) => i.user == user._id);

                    if (user.notifyPrefs && (user.notifyPrefs.disabled || !user.email)) {
                        userNotifications.forEach((notification) => {
                            notificationIdsToRemove.push(notification._id);
                        });
                        return;
                    }

                    var interval = 5;
                    if (user.notifyPrefs && user.notifyPrefs.interval > 5) {
                        interval = user.notifyPrefs.interval;
                    }
                    interval *= 60 * 1000;

                    if (user.lastNotifyDate && (user.lastNotifyDate + interval > Date.now())) {
                        return;
                    }

                    userNotifications.forEach((notification) => {
                        notificationIdsToRemove.push(notification._id);
                    });

                    return q.when(config.backend.onSendUserNotifications(user,
                        userNotifications.map(i => _.pick(i, ['message','date','count','type']))));
                })
                .catch((e) => console.log(`Error sending a message to ${user.username}: ${e}`))
                .then(() => notificationIdsToRemove.length > 0 && q.all([
                    db['users.notifications'].removeWhere({_id: {$in: notificationIdsToRemove}}),
                    db.users.update({_id: user._id}, {$set: {lastNotifyDate: Date.now()}})
                ]))
            });
            return promise;
        })
};

exports.roomsForceUpdate = function roomsForceUpdate() {
    return common.getGametime()
        .then(gameTime => {
            return db.rooms.find({$and: [{status: {$ne: 'out of borders'}}, {active: false}]})
                .then(rooms => common.qSequence(rooms, room => {
                    if (!room.nextForceUpdateTime || gameTime >= room.nextForceUpdateTime) {
                        return db.rooms.update({_id: room._id}, {
                            $set: {
                                active: true,
                                nextForceUpdateTime: gameTime + 90 + Math.floor(Math.random() * 20)
                            }
                        });
                    }
                }))
        });
};

exports.genPowerBanks = function genPowerBanks() {

    // TODO

    /*return common.getGametime()
        .then(gameTime => {
            return db.rooms.find({$and: [{bus: true}, {status: 'normal'}]})
                .then(rooms => q.all(rooms.map(room => {

                    var respawnTime = Math.round(Math.random()*C.POWER_BANK_RESPAWN_TIME/2 + C.POWER_BANK_RESPAWN_TIME*0.75);

                    if (!room.powerBankTime) {
                        room.powerBankTime = gameTime + respawnTime;
                        return db.rooms.update({_id: room._id}, {$set: room});
                    }
                    if (gameTime >= room.powerBankTime) {
                        room.powerBankTime = gameTime + respawnTime;
                        room.active = true;

                        return db['rooms.terrain'].findOne({room: room._id})
                            .then((data) => {

                                var x, y, isWall, hasExit;
                                do {
                                    x = Math.floor(Math.random() * 40 + 5);
                                    y = Math.floor(Math.random() * 40 + 5);
                                    isWall = parseInt(data.terrain.charAt(y * 50 + x)) & 1;
                                    hasExit = false;
                                    for (var dx = -1; dx <= 1; dx++) {
                                        for (var dy = -1; dy <= 1; dy++) {
                                            if (!(parseInt(data.terrain.charAt((y + dy) * 50 + x + dx)) & 1)) {
                                                hasExit = true;
                                            }
                                        }
                                    }
                                }
                                while (!isWall || !hasExit);

                                var power = Math.floor(Math.random() * (C.POWER_BANK_CAPACITY_MAX - C.POWER_BANK_CAPACITY_MIN) + C.POWER_BANK_CAPACITY_MIN);
                                if(Math.random() < C.POWER_BANK_CAPACITY_CRIT) {
                                    power += C.POWER_BANK_CAPACITY_MAX;
                                }

                                return db['rooms.objects'].insert({
                                    type: 'powerBank',
                                    x, y,
                                    room: room._id,
                                    power,
                                    hits: C.POWER_BANK_HITS,
                                    hitsMax: C.POWER_BANK_HITS,
                                    decayTime: gameTime + C.POWER_BANK_DECAY
                                });
                            })
                            .then(() => db.rooms.update({_id: room._id}, {$set: room}));
                    }
                })));
        })*/
};

exports.genInvaders = function genInvaders() {

    function checkExit(roomName, exit) {
        var [x,y] = utils.roomNameToXY(roomName);
        if(exit == 'top') y--;
        if(exit == 'right') x++;
        if(exit == 'bottom') y++;
        if(exit == 'left') x--;
        var newRoomName = utils.roomNameFromXY(x,y);
        return db['rooms.objects'].findOne({$and: [{room: newRoomName}, {type: 'controller'}]})
            .then(controller => {
                if(controller && (controller.user || controller.reservation)) {
                    return q.reject();
                }
            })
    }

    function createCreep(type, room, square, boosted) {

        var [x,y] = utils.roomNameToXY(room);

        var body = {
            bigHealer: ['move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','heal','move'],
            bigRanged: ['tough','tough','tough','tough','tough','tough','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','ranged_attack','ranged_attack','ranged_attack','ranged_attack','ranged_attack','ranged_attack','ranged_attack','ranged_attack','ranged_attack','ranged_attack','ranged_attack','ranged_attack','ranged_attack','ranged_attack','ranged_attack','ranged_attack','ranged_attack','ranged_attack','work','move'],
            bigMelee: ['tough','tough','tough','tough','tough','tough','tough','tough','tough','tough','tough','tough','tough','tough','tough','tough','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','move','ranged_attack','ranged_attack','ranged_attack','work','work','work','work','attack','attack','move'],
            smallHealer: ['move','move','move','move','heal','heal','heal','heal','heal','move'],
            smallRanged: ['tough','tough','move','move','move','move','ranged_attack','ranged_attack','ranged_attack','move'],
            smallMelee: ['tough','tough','move','move','move','move','ranged_attack','work','attack','move']
        };

        var creep = {
            type: 'creep',
            user: '2',
            body: _.map(body[type], type => ({type, hits: 100})),
            hits: body[type].length * 100,
            hitsMax: body[type].length * 100,
            ticksToLive: 1500,
            x: square[0],
            y: square[1],
            room,
            fatigue: 0,
            energy: 0,
            energyCapacity: 0,
            name: `invader_${room}_${Math.floor(Math.random()*1000)}`
        };

        if(boosted) {
            creep.body.forEach(i => {
                if(i.type == 'heal') {
                    i.boost = isCenter(x,y) ? 'XLHO2' : 'LO';
                }
                if(i.type == 'ranged_attack') {
                    i.boost = isCenter(x,y) ? 'XKHO2' : 'KO';
                }
                if(i.type == 'work') {
                    i.boost = isCenter(x,y) ? 'XZH2O' : 'ZH';
                }
                if(i.type == 'attack') {
                    i.boost = isCenter(x,y) ? 'XUH2O' : 'UH';
                }
                if(i.type == 'tough') {
                    i.boost = isCenter(x,y) ? 'XGHO2' : 'GO';
                }
            })
        }

        return db['rooms.objects'].insert(creep);
    }

    function findClosestExit(square, exits) {
        var sortedExits = _.sortBy(exits, i => Math.max(Math.abs(i[0] - square[0]), Math.abs(i[1] - square[1])));
        return sortedExits[0];
    }


    function createRaid(controllerLevel, room, exits) {

        var type = controllerLevel && controllerLevel >= 4 ? 'big' : 'small';

        var max = 1, count = 1, boostChance = 0.5;

        var [x,y] = utils.roomNameToXY(room);

        if(Math.random() > 0.9 || isCenter(x,y)) {
            max = 2;
            boostChance = type == 'big' ? 0 : 0.5;
            if (Math.random() > 0.8 || isCenter(x,y)) {
                max = 5;
                if (type == 'big') {
                    if (controllerLevel < 5) {
                        max = 2;
                    }
                    else if (controllerLevel < 6) {
                        max = 2;
                    }
                    else if (controllerLevel < 7) {
                        max = 3;
                    }
                    else if (controllerLevel < 8) {
                        boostChance = 0.4;
                        max = 3;
                    }
                    else {
                        boostChance = 0.4;
                        max = 5;
                    }
                }
            }

            count = Math.floor(Math.random()*(max-1)) + 2;
            count = Math.min(count, exits.length);
        }

        var promises = [], lastSquare;

        for(var i=0; i<count; i++) {
            var subtype = i == 0 && !isCenter(x,y) ? 'Melee' :
                i == 0 || (i == 1 || i == 2 && count == 5) && Math.random() > 0.5 ? 'Ranged' :
                    'Healer';

            var square = lastSquare ? findClosestExit(lastSquare, exits) : exits[Math.floor(Math.random() * exits.length)];
            if(!square) {
                break;
            }
            promises.push(createCreep(type + subtype, room, square, Math.random() < boostChance));
            _.pull(exits, square);
            lastSquare = square;
        }

        return q.all(promises);
    }

    return db.rooms.find({$and: [{status: 'normal'}, {active: true}]})
        .then(rooms => q.all(rooms.map(room => {

            return db['rooms.objects'].find({$and: [{room: room._id}, {type: {$in: ['source','controller','creep']}}]})
                .then(objects => {
                    var sources = _.filter(objects, {type: 'source'});
                    var creeps = _.filter(objects, {type: 'creep', user: '2'});
                    if(creeps.length) {
                        return;
                    }
                    var invaderHarvested = _.sum(sources, 'invaderHarvested');
                    var goal = room.invaderGoal || C.INVADERS_ENERGY_GOAL;
                    if(goal != 1 && invaderHarvested < goal) {
                        return;
                    }
                    return db['rooms.terrain'].findOne({room: room._id})
                        .then(terrain => {
                            var exits = {}, exitSquares = {top: [], left: [], right: [], bottom: []};
                            for(var i=0; i<49; i++) {
                                if(!common.checkTerrain(terrain.terrain, i, 0, C.TERRAIN_MASK_WALL)) {
                                    exits.top = true;
                                    exitSquares.top.push([i,0]);
                                }
                                if(!common.checkTerrain(terrain.terrain, i, 49, C.TERRAIN_MASK_WALL)) {
                                    exits.bottom = true;
                                    exitSquares.bottom.push([i,49]);
                                }
                                if(!common.checkTerrain(terrain.terrain, 0, i, C.TERRAIN_MASK_WALL)) {
                                    exits.left = true;
                                    exitSquares.left.push([0,i]);
                                }
                                if(!common.checkTerrain(terrain.terrain, 49, i, C.TERRAIN_MASK_WALL)) {
                                    exits.right = true;
                                    exitSquares.right.push([49,i]);
                                }
                            }
                            exits = _.keys(exits);
                            return q.all(_.map(exits, exit => {
                                    return checkExit(room._id, exit).catch(() => _.pull(exits, exit));
                                }))
                                .then(() => {
                                    if(!exits.length) {
                                        return;
                                    }
                                    var exit = exits[Math.floor(Math.random()*exits.length)];
                                    var controller = _.find(objects, {type: 'controller'});
                                    return createRaid(controller && controller.user && controller.level, room._id, exitSquares[exit]);
                                })
                        })
                        .then(() => {
                            var invaderGoal = Math.floor(C.INVADERS_ENERGY_GOAL * (Math.random()*0.6 + 0.7));
                            if(Math.random() < 0.1) {
                                invaderGoal *= Math.floor( Math.random() > 0.5 ? 2 : 0.5 );
                            }
                            return db.rooms.update({_id: room._id}, {$set: {invaderGoal}})
                        })
                        .then(() => db['rooms.objects'].update({$and: [{room: room._id}, {type: 'source'}]}, {$set: {invaderHarvested: 0}}));
                })
        })));
};

exports.purgeTransactions = function purgeTransactions() {
    return db.transactions.find()
        .then(data => {
            data = _.sortBy(data, i => -parseInt(i.time));

            var senders = {}, recipients = {}, forDelete = [];
            data.forEach(i => {
                var flag1 = true, flag2 = true;
                senders[i.sender] = senders[i.sender] || [];
                if(senders[i.sender].length < 100) {
                    senders[i.sender].push(i);
                    flag1 = false;
                }
                recipients[i.recipient] = recipients[i.recipient] || [];
                if(recipients[i.recipient].length < 100) {
                    recipients[i.recipient].push(i);
                    flag2 = false;
                }
                if(flag1 && flag2) {
                    forDelete.push(i._id);
                }
            });

            if(forDelete.length > 0) {
                return db.transactions.removeWhere({_id: {$in: forDelete}});
            }
        })
};

exports.calcMarketStats = function calcMarketStats() {
    // TODO
};

exports.updateRoomImageAssets = function updateRoomImageAssets(roomName) {

    return db['rooms.terrain'].findOne({room: roomName})
        .then(terrainItem => utils.writeTerrainToPng(terrainItem.terrain,
            path.resolve(process.env.ASSET_DIR, 'map', roomName + '.png'), true))
        .then(() => {
            var [x,y] = utils.roomNameToXY(roomName);
            x = Math.floor(x / 4) * 4;
            y = Math.floor(y / 4) * 4;
            var firstRoomName = utils.roomNameFromXY(x,y);
            var allRoomNames = [];
            for(var xx=x; xx<=x+4; xx++) {
                for(var yy=y; yy<=y+4; yy++) {
                    allRoomNames.push(utils.roomNameFromXY(xx,yy));
                }
            }
            return db['rooms.terrain'].find({room: {$in: allRoomNames}})
                .then(data => {
                    var mergedColors = {};
                    for(var yy=0; yy<200; yy++) {
                        mergedColors[yy] = {};
                        for(var xx=0; xx<200; xx++) {
                            mergedColors[yy][xx] = [0,0,0,0];
                        }
                    }
                    for(var xx=0; xx<4; xx++) {
                        for(var yy=0; yy<4; yy++) {

                            var terrainItem = _.find(data, {room: utils.roomNameFromXY(xx+x,yy+y)});
                            if(!terrainItem) {
                                continue;
                            }

                            var colors = utils.createTerrainColorsMap(terrainItem.terrain, false);
                            for(var cy in colors) {
                                for(var cx in colors[cy]) {
                                    mergedColors[parseInt(cy)+yy*50][parseInt(cx)+xx*50] = colors[cy][cx];
                                }
                            }
                        }
                    }

                    return utils.writePng(mergedColors, 200, 200,
                        path.resolve(process.env.ASSET_DIR, 'map/zoom2', firstRoomName + '.png'));
                })
        });
};


/*
exports.roomsImport = function roomsImport(topLeft, bottomRight, dir) {

    var [x1,y1] = utils.roomNameToXY(topLeft);
    var [x2,y2] = utils.roomNameToXY(bottomRight);
    console.log(x1, y1);
    console.log(x2, y2);
    var promise = q.when();

    for(var rx=x1; rx<=x2; rx++) {
        for (var ry = y1; ry <= y2; ry++) {
            let name = utils.roomNameFromXY(rx,ry);
            promise = promise.then(() => db.rooms.findOne({_id: name}))
                .then((room) => {
                    if (room) {
                        console.log(name,'SKIP');
                        return false;
                    }
                    console.log(name);

                    let roomTerrain = JSON.parse(fs.readFileSync(`${dir}/${name}.json`));
                    let terrain = [], objects = [];
                    let sourceKeepers = false;
                    let bus = isBus(rx) || isBus(ry);

                    for (var y in roomTerrain) {
                        y = parseInt(y);
                        for (var x in roomTerrain[y]) {
                            x = parseInt(x);
                            if (roomTerrain[y][x].wall) {
                                terrain.push({type: 'wall', x, y});
                            }
                            if (roomTerrain[y][x].source) {
                                objects.push({
                                    room: name,
                                    type: 'source',
                                    x,
                                    y,
                                    "energy": 3000,
                                    "energyCapacity": 3000,
                                    "ticksToRegeneration": 300
                                });
                            }
                            if (roomTerrain[y][x].controller) {
                                objects.push({room: name, type: 'controller', x, y, level: 0});
                            }
                            if (roomTerrain[y][x].keeperLair) {
                                objects.push({room: name, type: 'keeperLair', x, y});
                                sourceKeepers = true;
                            }
                            if (roomTerrain[y][x].swamp) {
                                var flag = false;
                                for (var dx = -1; dx <= 1; dx++) {
                                    for (var dy = -1; dy <= 1; dy++) {
                                        if (x + dx >= 0 && y + dy >= 0 && x + dx <= 49 && y + dy <= 49 && !roomTerrain[y + dy][x + dx].wall) {
                                            flag = true;
                                            break;
                                        }
                                    }
                                    if (flag) {
                                        break;
                                    }
                                }
                                if (flag) {
                                    terrain.push({type: 'swamp', x, y});
                                }
                            }
                        }
                    }

                    terrain = common.encodeTerrain(terrain);

                    return db['rooms.terrain'].removeWhere({room: name})
                        .then(() => db['rooms.terrain'].insert({
                            room: name,
                            terrain,
                            type: 'terrain'
                        }))
                        .then(() => db['rooms.objects'].removeWhere({$and: [{room: name}, {type: {$in: ['controller', 'source', 'keeperLair']}}]}))
                        .then(() => objects.length && db['rooms.objects'].insert(objects))
                        .then(() => db.rooms.update({_id: name}, {$set: {
                            active: false,
                            status: 'out of borders',
                            sourceKeepers,
                            bus
                        }}, {upsert: true}))
                        .then((data) => console.log(data && data.result))                        ;
                });

        }
    }

    return promise.catch(err => console.log(err));
};





exports.genMinerals = (topLeft, bottomRight) => {
    var [x1,y1] = utils.roomNameToXY(topLeft);
    var [x2,y2] = utils.roomNameToXY(bottomRight);

    var types = ['H','H','H','H','H','H',  'O','O','O','O','O','O',  'Z','Z','Z', 'K','K','K', 'U','U','U', 'L','L','L', 'X'];

    var promise = q.when();

    for(let x=x1; x<=x2; x++) {
        for(let y=y1; y<=y2; y++) {
            let room = utils.roomNameFromXY(x,y);
            if(isBus(x) || isBus(y) || isCenter(x,y)) {
                continue;
            }
            promise = promise
                .then(() => db['rooms.objects'].findOne({$and: [{room}, {type: 'mineral'}]}))
                .then(mineral => mineral ? q.reject() : undefined)
                .then(() => q.all([db['rooms.objects'].find({room}), db['rooms.terrain'].findOne({room})]))
                .then((data) => {
                    var [objects, terrain] = data;
                    if(!terrain) {
                        console.log(`${room}: no terrain`);
                        return;
                    }
                    var mx,my,isWall,hasSpot,hasObjects;
                    do {
                        mx = 4 + Math.floor(Math.random()*42);
                        my = 4 + Math.floor(Math.random()*42);
                        isWall = common.checkTerrain(terrain.terrain, mx, my, C.TERRAIN_MASK_WALL);
                        hasSpot = false;
                        for(var dx=-1;dx<=1;dx++) {
                            for(var dy=-1;dy<=1;dy++) {
                                if(!common.checkTerrain(terrain.terrain,mx+dx,my+dy, C.TERRAIN_MASK_WALL)) {
                                    hasSpot = true;
                                }
                            }
                        }
                        hasObjects = _.any(objects, i => (i.type == 'source' || i.type == 'controller') && Math.abs(i.x - mx) < 5 && Math.abs(i.y - my) < 5);
                    }
                    while(!isWall || !hasSpot || hasObjects);

                    console.log(`${room}: ${mx},${my}`);

                    var mineralType = types[Math.floor(Math.random()*types.length)];
                    var mineralAmount = C.MINERAL_MIN_AMOUNT[mineralType] * (1+Math.random()*(C.MINERAL_RANDOM_FACTOR-1));

                    return db['rooms.objects'].removeWhere({$and: [{room}, {type: 'mineral'}]})
                        .then(() => db['rooms.objects'].insert({type: 'mineral', mineralType, mineralAmount, x: mx, y: my, room}));
                })
                .catch(e => {
                    console.error(e);
                })
        }
    }

    return promise;
};

exports.genCenterMinerals = (topLeft, bottomRight) => {
    var [x1,y1] = utils.roomNameToXY(topLeft);
    var [x2,y2] = utils.roomNameToXY(bottomRight);

    var types = ['H','H','H','H','H','H',  'O','O','O','O','O','O',  'Z','Z','Z', 'K','K','K', 'U','U','U', 'L','L','L', 'X'];

    var promise = q.when();

    for(let x=x1; x<=x2; x++) {
        for(let y=y1; y<=y2; y++) {
            let room = utils.roomNameFromXY(x,y);
            if(!isCenter(x,y)) {
                continue;
            }
            promise = promise
                .then(() => db['rooms.objects'].findOne({$and: [{room}, {type: 'mineral'}]}))
                .then(mineral => mineral ? q.reject() : undefined)
                .then(() => db['rooms.objects'].find({room}))
                .then((objects) => {

                    var sources = _.filter(objects, {type:'source'});

                    var source = sources[Math.floor(Math.random()*sources.length)];

                    console.log(`${room}: ${source.x},${source.y}`);

                    var mineralType = types[Math.floor(Math.random()*types.length)];
                    var mineralAmount = C.MINERAL_MIN_AMOUNT[mineralType] * (1+Math.random()*(C.MINERAL_RANDOM_FACTOR-1));

                    return db['rooms.objects'].removeWhere({$and: [{type: 'mineral'}, {room}]})
                        .then(() => db['rooms.objects'].removeWhere({_id: source._id}))
                        .then(() => db['rooms.objects'].insert(
                            [
                                {type: 'mineral', mineralType, mineralAmount, x: source.x, y: source.y, room},
                                {type: 'extractor', x: source.x, y: source.y, room}
                            ]));
                })
                .catch(e => true)
        }
    }

    return promise;

};

exports.genMineralsDensity = () => {
    return db['rooms.objects'].find({type: 'mineral'})
        .then(minerals => common.qSequence(minerals, mineral => {
            var random = Math.random();
            for(var density in C.MINERAL_DENSITY_PROBABILITY) {
                if(random <= C.MINERAL_DENSITY_PROBABILITY[density]) {
                    console.log(mineral.room,'->',density);
                    return db['rooms.objects'].update({_id: mineral._id}, {$set: {density: +density}});
                }
            }
        }))
};*/

exports._help = utils.generateCliHelp('tools.', exports);