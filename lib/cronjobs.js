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
    strongholds = require('./strongholds');

config.cronjobs = {
    sendNotifications: [60, sendNotifications],
    roomsForceUpdate: [20, roomsForceUpdate],
    genPowerBanks: [5*60, genPowerBanks],
    genInvaders: [5*60, genInvaders],
    purgeTransactions: [60*60, purgeTransactions],
    recreateNpcOrders: [5*60, recreateNpcOrders],
    calcMarketStats: [60*60, calcMarketStats],
    deletePowerCreeps: [10*60, deletePowerCreeps],
    genDeposits: [5*60, genDeposits],
    genStrongholds: [5*60, strongholds.genStrongholds],
    expandStrongholds: [15*60, strongholds.expandStrongholds]
};

module.exports.run = function() {
    _.forEach(config.cronjobs, (i,key) => {
        if(Date.now() - (i[2]||0) > i[0]*1000) {
            console.log(`Running cronjob '${key}'`);
            i[2] = Date.now();
            i[1]({utils});
        }
    });
};

function recreateNpcOrders() {
    var gameTime;

    var sellMinerals = ['X','Z','K','L','U','O','O','H','H','Z','K','L','U','O','O','H','H'];
    var buyMinerals = ['X','Z','K','L','U','O','O','H','H','Z','K','L','U','O','O','H','H'];
    var sellPrice = {
        H: 3000,
        O: 3000,
        Z: 6000,
        K: 6000,
        U: 6000,
        L: 6000,
        X: 18000
    };
    var buyPrice = 1000;

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
                    const nowTimestamp = new Date().getTime();
                    var sellMineral = sellMinerals[Math.floor(Math.random()*sellMinerals.length)];
                    var buyMineral = buyMinerals[Math.floor(Math.random()*buyMinerals.length)];
                    var orders = [];

                    orders.push({
                        created: gameTime,
                        createdTimestamp: nowTimestamp,
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
                            createdTimestamp: nowTimestamp,
                            active: true,
                            type: 'sell',
                            amount: period*sellEnergyAmount,
                            remainingAmount: period*sellEnergyAmount,
                            totalAmount: period*sellEnergyAmount,
                            resourceType: 'energy',
                            price: 1000,
                            roomName: terminal.room
                        });
                    }
                    if(Math.random() < 0.25) {
                        orders.push({
                            created: gameTime,
                            createdTimestamp: nowTimestamp,
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
}

function sendNotifications() {

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

                        var interval = 60;
                        if (user.notifyPrefs && user.notifyPrefs.interval) {
                            interval = user.notifyPrefs.interval;
                        }
                        interval *= 60 * 1000;

                        if (user.lastNotifyDate && (user.lastNotifyDate + interval > Date.now())) {
                            return;
                        }

                        userNotifications.forEach((notification) => {
                            notificationIdsToRemove.push(notification._id);
                        });

                        config.backend.emit('sendUserNotifications',user,
                            userNotifications.map(i => _.pick(i, ['message','date','count','type'])));
                    })
                    .catch((e) => console.log(`Error sending a message to ${user.username}: ${e}`))
                    .then(() => notificationIdsToRemove.length > 0 && q.all([
                        db['users.notifications'].removeWhere({_id: {$in: notificationIdsToRemove}}),
                        db.users.update({_id: user._id}, {$set: {lastNotifyDate: Date.now()}})
                    ]))
            });
            return promise;
        })
}

async function roomsForceUpdate() {
    const gameTime = await common.getGametime();
    const activeRooms = await utils.getActiveRooms();
    const rooms = await db.rooms.find({status: {$ne: 'out of borders'}, _id: {$nin: activeRooms}});
    for(let room of rooms) {
        if (!room.nextForceUpdateTime || gameTime >= room.nextForceUpdateTime) {
            await utils.activateRoom(room._id);
            await db.rooms.update({_id: room._id}, {
                $set: {
                    nextForceUpdateTime: gameTime + 90 + Math.floor(Math.random() * 20)
                }
            });
        }
    }
}

async function genPowerBanks() {
    const gameTime = await common.getGametime();
    const rooms = await db.rooms.find({bus: true, status: 'normal'});

    for(const room of rooms) {
        const respawnTime = Math.round(Math.random() * C.POWER_BANK_RESPAWN_TIME / 2 + C.POWER_BANK_RESPAWN_TIME * 0.75);
        if (!room.powerBankTime) {
            room.powerBankTime = gameTime + respawnTime;
            await db.rooms.update({_id: room._id}, {$set: room});
            continue;
        }

        if (gameTime < room.powerBankTime) {
            continue;
        }

        room.powerBankTime = gameTime + respawnTime;
        const data = await db['rooms.terrain'].findOne({room: room._id});
        let x, y, isWall, hasExit;
        do {
            x = Math.floor(Math.random() * 40 + 5);
            y = Math.floor(Math.random() * 40 + 5);
            isWall = parseInt(data.terrain.charAt(y * 50 + x)) & 1;
            hasExit = false;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (!(parseInt(data.terrain.charAt((y + dy) * 50 + x + dx)) & 1)) {
                        hasExit = true;
                    }
                }
            }
        }
        while (!isWall || !hasExit);
        let power = Math.floor(Math.random() * (C.POWER_BANK_CAPACITY_MAX - C.POWER_BANK_CAPACITY_MIN) + C.POWER_BANK_CAPACITY_MIN);
        if (Math.random() < C.POWER_BANK_CAPACITY_CRIT) {
            power += C.POWER_BANK_CAPACITY_MAX;
        }
        await db['rooms.objects'].insert({
            type: 'powerBank',
            x, y,
            room: room._id,
            store: {power},
            hits: C.POWER_BANK_HITS,
            hitsMax: C.POWER_BANK_HITS,
            decayTime: gameTime + C.POWER_BANK_DECAY
        });
        await db.rooms.update({_id: room._id}, {$set: {powerBankTime: room.powerBankTime}});
        await utils.activateRoom(room._id);
    }
}

async function genInvaders() {

    function checkExit(roomName, exit) {
        var [x,y] = utils.roomNameToXY(roomName);
        if(exit == 'top') y--;
        if(exit == 'right') x++;
        if(exit == 'bottom') y++;
        if(exit == 'left') x--;
        var newRoomName = utils.roomNameFromXY(x,y);
        return db['rooms.objects'].findOne({room: newRoomName, type: 'controller'})
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
            store: {},
            storeCapacity: 0,
            name: `invader_${room}_${Math.floor(Math.random()*1000)}`
        };

        if(boosted) {
            creep.body.forEach(i => {
                if(i.type == 'heal') {
                    i.boost = utils.isCenter(x,y) ? 'XLHO2' : 'LO';
                }
                if(i.type == 'ranged_attack') {
                    i.boost = utils.isCenter(x,y) ? 'XKHO2' : 'KO';
                }
                if(i.type == 'work') {
                    i.boost = utils.isCenter(x,y) ? 'XZH2O' : 'ZH';
                }
                if(i.type == 'attack') {
                    i.boost = utils.isCenter(x,y) ? 'XUH2O' : 'UH';
                }
                if(i.type == 'tough') {
                    i.boost = utils.isCenter(x,y) ? 'XGHO2' : 'GO';
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

        if(Math.random() > 0.9 || utils.isCenter(x,y)) {
            max = 2;
            boostChance = type == 'big' ? 0 : 0.5;
            if (Math.random() > 0.8 || utils.isCenter(x,y)) {
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
            var subtype = i == 0 && !utils.isCenter(x,y) ? 'Melee' :
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

    const activeRooms = await utils.getActiveRooms();
    const rooms = await db.rooms.find({status: 'normal', _id: {$nin: activeRooms}});
    for(const room of rooms) {
        const objects = await db['rooms.objects'].find({room: room._id, type: {$in: ['source','controller','creep']}});
        const creeps = _.filter(objects, {type: 'creep', user: '2'});
        if(creeps.length) {
            continue;
        }

        const sources = _.filter(objects, {type: 'source'});
        const invaderHarvested = _.sum(sources, 'invaderHarvested');
        const goal = room.invaderGoal || C.INVADERS_ENERGY_GOAL;
        if(goal != 1 && invaderHarvested < goal) {
            continue;
        }

        const sectorRegex = room._id.replace(/^([WE]\d*)\d([NS]\d*)\d$/, (str, p1, p2) => `^${p1}\\d${p2}\\d$`);
        const invaderCore = await db['rooms.objects'].count({type: 'invaderCore', level: {$gt: 0}, room: {$regex: sectorRegex}});
        if(!invaderCore) {
            console.log(`Skip room ${room._id} since there is no invaderCore in sector regex ${sectorRegex}`);
            continue;
        }

        const terrain = await db['rooms.terrain'].findOne({room: room._id});
        let exits = {}, exitSquares = {top: [], left: [], right: [], bottom: []};
        for(let i=0; i<49; i++) {
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

        await q.all(_.map(exits, exit => {
            return checkExit(room._id, exit).catch(() => _.pull(exits, exit));
        }));

        if(!exits.length) {
            continue;
        }
        const exit = exits[Math.floor(Math.random()*exits.length)];
        const controller = _.find(objects, {type: 'controller'});
        await createRaid(controller && controller.user && controller.level, room._id, exitSquares[exit]);

        let invaderGoal = Math.floor(C.INVADERS_ENERGY_GOAL * (Math.random()*0.6 + 0.7));
        if(Math.random() < 0.1) {
            invaderGoal *= Math.floor( Math.random() > 0.5 ? 2 : 0.5 );
        }
        await db.rooms.update({_id: room._id}, {$set: {invaderGoal}})
        await db['rooms.objects'].update({room: room._id, type: 'source'}, {$set: {invaderHarvested: 0}});
        await utils.activateRoom(room._id);
    }
}

function purgeTransactions() {
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
}

function calcMarketStats() {
    return db['market.stats'].removeWhere({})
        .then(()=>db['users.money'].find({$and: [{date: {$gt: new Date(Date.now() - 14 * 24 * 3600 * 1000)}},{type: 'market.sell'}]}))
        .then(data => {
            const result = {};

            data.forEach(i => {
                const date = new Date(i.date);
                i.dateStr = `${date.getFullYear()}-${date.getMonth()<9?'0':''}${date.getMonth()+1}-${date.getDate()<10?'0':''}${date.getDate()}`;
                const r = i.market.resourceType;
                if (!result[r]) {
                    result[r] = {};
                }
                if (!result[r][i.dateStr]) {
                    result[r][i.dateStr] = {sumPrice: 0, sumAmount: 0, stddev: 0, cnt: 0};
                }
                result[r][i.dateStr].sumPrice += i.change;
                result[r][i.dateStr].sumAmount += i.market.amount;
                result[r][i.dateStr].cnt++;
            });

            for (let resourceType in result) {
                for(let date in result[resourceType]) {
                    result[resourceType][date].avg = result[resourceType][date].sumPrice / result[resourceType][date].sumAmount;
                }
            }

            data.forEach(i => {
                result[i.market.resourceType][i.dateStr].stddev += i.market.amount *
                    Math.pow(i.market.price - result[i.market.resourceType][i.dateStr].avg, 2) /
                    result[i.market.resourceType][i.dateStr].sumAmount;
            });

            const promises = [];

            for (let resourceType in result) {
                for (let date in result[resourceType]) {
                    const i = result[resourceType][date];
                    promises.push(db['market.stats'].insert({
                            resourceType,
                            date,
                            transactions: i.cnt,
                            volume: i.sumAmount,
                            avgPrice: +i.avg.toFixed(3),
                            stddevPrice: +Math.sqrt(i.stddev).toFixed(3)
                        }));
                }
            }

            return q.all(promises)
        }).catch(console.log);
};

function calcPowerLevelBase(level) {
    return Math.pow(level, C.POWER_LEVEL_POW) * C.POWER_LEVEL_MULTIPLY;
}

function calcPowerLevel(power) {
    return Math.floor( Math.pow( (power || 0) / C.POWER_LEVEL_MULTIPLY, 1 / C.POWER_LEVEL_POW ) );
}

function deletePowerCreeps() {
    return db['users.power_creeps'].find({deleteTime: {$lt: Date.now()}})
        .then((data) => _.reduce(data, (promise, creep) => {
            if(!creep.deleteTime) {
                return promise;
            }
            return promise
                .then(() => db['users'].findOne({_id: creep.user}))
                .then(user => {
                    var level = calcPowerLevel(user.power);
                    var basePrev = calcPowerLevelBase(level-1);
                    var baseCurrent = calcPowerLevelBase(level);
                    var baseNext = calcPowerLevelBase(level+1);
                    var change = Math.round(user.power - basePrev -
                        (user.power - baseCurrent) * (baseCurrent - basePrev) / (baseNext - baseCurrent));
                    return q.all([
                        db['users'].update({_id: user._id}, {$inc: {power: -change}}),
                        db['users.power_creeps'].removeWhere({_id: creep._id})
                    ]);
                })
        }, q.when()));
}

async function genDeposits(){
    function getSectorEdges(centralRoomName) {
        const result = /^([WE])(\d*)5([NS])(\d*)5$/.exec(centralRoomName);
        if(!result) {
            return undefined;
        }
        const roomNames = [];
        const [, we, xx, ns, yy] = result;
        for(let i = 0; i <= 10; i++) {
            roomNames.push(`${we}${10*xx+i}${ns}${10*yy}`);
            roomNames.push(`${we}${10*xx+10}${ns}${10*yy+i}`);
            roomNames.push(`${we}${10*xx}${ns}${10*yy+i}`);
            roomNames.push(`${we}${10*xx+i}${ns}${10*yy+10}`);
        }
        return _.unique(roomNames);
    }

    const gameTime = await common.getGametime();
    const centralRooms = await db['rooms'].find({_id: {$regex: '^[WE]\d*5[NS]\d*5$'}, status: {$ne: 'out of borders'}});
    const deposits = await db['rooms.objects'].find({type: 'deposit'});

    for(const center of centralRooms) {
        const sectorEdges = getSectorEdges(center._id);
        const [cx, cy] = utils.roomNameToXY(center._id); const [cxx, cyy] = [24+50*cx, 24+50*cy];
        const sectorDeposits = _.filter(deposits, d => {
            if(!_.includes(sectorEdges, d.room)) {
                return false;
            }

            // distance from the center of central room must be half of the sector size (250 tiles)
            const [xx, yy] = utils.roomNameToXY(d.room);
            return (Math.abs(50*xx + d.x - cxx) < 250) && (Math.abs(50*yy+d.y - cyy) < 250);
        });
        const throughput = _.sum(sectorDeposits, deposit => 20/Math.max(1,(C.DEPOSIT_EXHAUST_MULTIPLY*Math.pow(deposit.harvested||0,C.DEPOSIT_EXHAUST_POW))));
        if(throughput >= 2.5) {
            continue;
        }

        const rooms = await db['rooms'].find({_id: {$in: sectorEdges}, bus: true, status: 'normal', depositType: {$exists: true}});
        if(!_.some(rooms)) {
            return q.reject(`No normal bus rooms found for the sector of ${center._id}} (${sectorRegex})`);
        }
        const busyRooms = sectorDeposits.map(i => i.room);
        const freeRooms = _.reject(rooms, r => _.includes(busyRooms, r._id));

        if(!_.some(freeRooms)) {
            return;
        }

        const room = _.sample(freeRooms);
        const terrain = await db['rooms.terrain'].findOne({room: room._id});
        if(!terrain) {
            console.log(`${room._id}: no terrain`);
            return;
        }

        const objects = await db['rooms.objects'].find({room: room._id});
        const [xx, yy] = utils.roomNameToXY(room._id);
        let x, y, isWall, hasExit, inSector, nearObjects, cnt=0;
        do {
            cnt++;
            x = Math.floor(Math.random() * 40 + 5);
            y = Math.floor(Math.random() * 40 + 5);
            isWall = parseInt(terrain.terrain.charAt(y * 50 + x)) & 1;
            hasExit = false;
            inSector = (Math.abs(50*xx + x - cxx) < 250) && (Math.abs(50*yy+y - cyy) < 250);
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (!(parseInt(terrain.terrain.charAt((y + dy) * 50 + x + dx)) & 1)) {
                        hasExit = true;
                    }
                }
            }
            nearObjects = _.any(objects, obj => Math.abs(obj.x-x) <= 2 && Math.abs(obj.y-y) <= 2);
        }
        while ((!isWall || !hasExit || nearObjects) && cnt < 1000);
        if(cnt >= 1000) {
            console.log(`cannot find location in ${room._id}`);
            continue;
        }

        if(room.depositType) {
            const obj = {type: 'deposit', depositType: room.depositType, x, y, room: room._id, harvested: 0, decayTime: C.DEPOSIT_DECAY_TIME + gameTime};
            await db['rooms.objects'].insert(obj);
            await utils.activateRoom(room._id);
        }
    }
}
