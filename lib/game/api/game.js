var express = require('express'),
    router = express.Router(),
    q = require('q'),
    _ = require('lodash'),
    jsonResponse = require('q-json-response'),
    auth = require('./auth'),
    utils = require('../../utils'),
    common = require('@screeps/common'),
    config = common.configManager.config,
    db = common.storage.db,
    env = common.storage.env,
    pubsub = common.storage.pubsub,
    C = common.configManager.config.common.constants,
    worldSize;

const lastTicks = [];
let lastTime;

function checkGame(request) {

    return db.rooms.findOne({_id: request.body.room})
    .then((room) => {
        if(!room) {
            return q.reject('invalid room');
        }
        if(/^(W|E)/.test(request.body.room)) {
            if(room.status == 'out of borders' || room.openTime && room.openTime > Date.now()) {
                return q.reject('out of borders');
            }
            return true;
            /*return qDb.coupons.world.findOne({user: request.user._id})
             .then((coupon) => coupon ? true : q.reject('not allowed'));*/
        }
        return q.reject('not supported');
    })
}

function checkForObjectAbsence(query) {
    return db['rooms.objects'].findOne(query)
    .then((data) => data ? q.reject('invalid location') : true);
}

function checkForTerrainAbsence(room, x, y, mask) {
    return db['rooms.terrain'].findOne({room})
    .then((data) => {
        var char = data.terrain.charAt(y*50+x);
        var code = parseInt(char);
        return (code & mask) ? q.reject('invalid location') : true;
    })
}

function checkForTerrainPresence(room, x, y, mask) {
    return db['rooms.terrain'].findOne({room})
    .then((data) => {
        var char = data.terrain.charAt(y*50+x);
        var code = parseInt(char);
        return (code & mask) ? true : q.reject('invalid location');
    })
}


function checkConstructionSpot(room, structureType, x, y) {

    if(x <=0 || y <=0 || x>=49 || y>=49) {
        return q.reject('invalid location');
    }

    if(structureType == 'extractor') {
        return checkForObjectAbsence({$and: [{room}, {x}, {y}, {type: 'mineral'}]})
        .then(() => q.reject('invalid location'), () => true);
    }

    var result = checkForObjectAbsence({$and: [{room}, {x}, {y}, {type: structureType}]})
    .then(() => checkForObjectAbsence({$and: [{room}, {x}, {y}, {type: 'constructionSite'}]}))
    .then(() => structureType == 'rampart' ? true : checkForObjectAbsence({$and: [{room}, {x}, {y}, {type: {$in: ['wall','constructedWall','spawn','extension','link','storage','tower','observer','powerSpawn']}}]}))
    .then(() => structureType == 'road' ? true :
        checkForTerrainAbsence(room, x, y, C.TERRAIN_MASK_WALL))
    .then(() => checkForObjectAbsence({$and: [{room}, {x: {$gt: x-2, $lt: x+2}}, {y: {$gt: y-2, $lt: y+2}}, {type: 'exit'}]}));

    if(structureType != 'road' && structureType != 'container' && (x == 1 || x == 48 || y == 1 || y == 48)) {
        var borderTiles;
        if(x == 1) borderTiles = [[0,y-1],[0,y],[0,y+1]];
        if(x == 48) borderTiles = [[49,y-1],[49,y],[49,y+1]];
        if(y == 1) borderTiles = [[x-1,0],[x,0],[x+1,0]];
        if(y == 48) borderTiles = [[x-1,49],[x,49],[x+1,49]];
        result = result
        .then(() => q.all(_.map(borderTiles, pos => checkForTerrainPresence(room, pos[0], pos[1], C.TERRAIN_MASK_WALL))))
    }

    return result;

}

function checkController(room, action, structureType, user) {
    if(!/^(W|E)/.test(room)) {
        return true;
    }
    return db['rooms.objects'].findOne({$and: [{room}, {type: 'controller'}]})
    .then((controller) => {
        if(action == 'spawn' && !controller) {
            return q.reject('invalid room');
        }
        if(action == 'spawn' && controller && controller.user) {
            return q.reject('room busy');
        }
        if(action == 'spawn' && controller && controller.reservation) {
            return q.reject('room busy');
        }
        if(action == 'spawn' && controller && controller.bindUser && controller.bindUser != ""+user) {
            return q.reject('room busy');
        }
        if(action == 'construct') {
            if(controller && (controller.user && controller.user != ""+user || controller.reservation && controller.reservation.user != ""+user)) {
                return q.reject('not a controller owner');
            }

            return db['rooms.objects'].find({room})
            .then((roomObjects) => checkControllerAvailability(structureType, roomObjects, controller) ? true : q.reject('RCL not enough'));
        }
        return true;
    });

}

function checkControllerAvailability(type, roomObjects, roomController) {

    var rcl = 0;
    if(roomController && roomController.level && roomController.user) {
        rcl = roomController.level;
    }

    var structuresCnt = _(roomObjects).filter((i) => i.type == type || i.type == 'constructionSite' && i.structureType == type).size();
    var availableCnt = C.CONTROLLER_STRUCTURES[type][rcl];

    return structuresCnt < availableCnt;
}

function getFlags(user, room) {

    var parse = (data) => {
        if(!data.length) {
            return [];
        }
        return _.map(data.split("|"), j => {
            var item = j.split("~");
            item[0] = item[0].replace(/\$VLINE\$/g,"|").replace(/\$TILDE\$/g,"~");
            return item;
        });
    }

    if(room) {
        return db['rooms.flags'].findOne({$and: [{user: "" + user}, {room}]})
        .then(item => {
            if (!item) {
                return [];
            }
            return parse(item.data);
        });
    }
    else {
        return db['rooms.flags'].find({user: ""+user})
        .then(data => {
            var result = {};
            data.forEach(i => {
                result[i.room] = parse(i.data);
            });
            return result;
        });
    }
}

function setFlags(user, room, flags) {
    if(!user || !room) {
        return;
    }
    flags = flags || [];
    var data = _.map(flags, i => {
        i[0] = i[0].replace(/\|/g,"$VLINE$").replace(/~/g,"$TILDE$");
        return i.join("~");
    }).join("|");

    return db['rooms.flags'].update({$and: [{user: ""+user}, {room}]}, {$set: {data}}, {upsert: true});
}

router.post('/map-stats', auth.tokenAuth, jsonResponse((request) => {

    if(!_.isArray(request.body.rooms)) {
        return q.reject('invalid params');
    }

    var match = request.body.statName.match(/^(.*?)(\d+)$/);
    if(!match) {
        return q.reject('invalid params');
    }

    var [,statName,interval] = match,
    stats = {},
    users = {},
    gameTime,
    statsMax;

    return common.getGametime()
    .then((data) => {
        gameTime = data;
        return db.rooms.find({_id: {$in: request.body.rooms}})
    })
    .then((data) => {
        data.forEach((i) => {
            stats[i._id] = {status: i.status, novice: i.novice, openTime: i.openTime};
        });
        return db['rooms.objects'].find({$and: [{room: {$in: request.body.rooms}}, {type: {$in: ['controller', 'invaderCore']}}]});
    })
    .then((data) => {
        data.forEach((i) => {
            if(i.type == 'controller') {
                if (i.user) {
                    stats[i.room].own = _.pick(i, ['user', 'level']);
                    users[i.user] = true;
                }
                if (i.reservation) {
                    stats[i.room].own = {user: i.reservation.user, level: 0};
                    users[i.reservation.user] = true;
                }
                if (i.sign) {
                    stats[i.room].sign = i.sign;
                    users[i.sign.user] = true;
                }
                if (i.safeMode > gameTime) {
                    stats[i.room].safeMode = true;
                }
            }
            if(i.type == 'invaderCore') {
                if(i.level > 0) {
                    stats[i.room].own = _.pick(i, ['user', 'level']);
                    users[i.user] = true;
                }
            }

        });

        statsMax = {};
        return db['rooms.objects'].find({$and: [{type: 'mineral'}, {room: {$in: request.body.rooms}}]})
        .then(data => {
            data.forEach(i => {
                stats[i.room].minerals0 = {type: i.mineralType, density: i.density};
            })
        })
    })
    .then(() => db.users.find({_id: {$in: _.keys(users)}},{ _id: true, username: true, badge: true }))
    .then(users => ({
        gameTime,
        stats,
        statsMax,
        users: _.indexBy(users, '_id')
    }));
}));

router.get('/time', jsonResponse((request) => {
    return common.getGametime().then(time => ({time}));
}));

router.get('/room-terrain', jsonResponse((request) => {

    return db['rooms.terrain'].find({room: request.query.room})
    .then((terrain) => {
        if(terrain.length == 0) {
            return q.reject('invalid room');
        }
        if(request.query.encoded) {
            return {terrain};
        }
        if(terrain.length == 1 && terrain[0].type == 'terrain') {
            return {terrain: common.decodeTerrain(terrain[0].terrain, request.query.room)};
        }
        return {terrain};
    })
}));

router.get('/room-status', auth.tokenAuth, jsonResponse((request) => {
    return db.rooms.findOne({_id: request.query.room})
    .then((data) => ({room: _.pick(data, ['status','novice','openTime'])}));
}));

router.post('/gen-unique-object-name', auth.tokenAuth, jsonResponse((request) => {

    if(!_.contains(['spawn'], request.body.type)) {
        return q.reject('invalid params');
    }

    return db['rooms.objects'].find({$and: [
        {user: request.user._id.toString()},
        {type: {$in: [request.body.type, 'constructionSite']}}
    ]})
    .then((objects) => {
        var baseName = request.body.type == 'spawn' ? 'Spawn' : 'Flag',
        c = 0;

        do {
            c++;
        }
        while(_.any(objects, {type: request.body.type, name: baseName+c}) ||
        _.any(objects, {type: 'constructionSite', structureType: request.body.type, name: baseName+c}));

        return {name: baseName+c};
    })
}));

router.post('/check-unique-object-name', auth.tokenAuth, jsonResponse((request) => {

    if(!_.contains(['spawn'], request.body.type) || !_.isString(request.body.name)) {
        return q.reject('invalid params');
    }

    return db['rooms.objects'].findOne({$and: [
        {user: request.user._id.toString()},
        {type: {$in: [request.body.type, 'constructionSite']}},
        {name: request.body.name}
    ]})
    .then((data) => {
        if(data) {
            return q.reject('name exists');
        }
        return {};
    })
}));

router.post('/place-spawn', auth.tokenAuth, jsonResponse((request) => {

    var x = parseInt(request.body.x),
    y = parseInt(request.body.y);

    if(x < 0 || x > 49 ||
        y < 0 || y > 49 ||
        request.body.name && (!_.isString(request.body.name) || request.body.name.length > 50)) {

        return q.reject('invalid params');
    }

    if(request.user.blocked) {
        return q.reject('blocked');
    }

    var objectsToInsert = [{
        type: 'spawn',
        room: request.body.room,
        x,
        y,
        name: request.body.name,
        user: request.user._id.toString(),
        store: { energy: C.SPAWN_ENERGY_START },
        storeCapacityResource: { energy: C.SPAWN_ENERGY_CAPACITY },
        hits: C.SPAWN_HITS,
        hitsMax: C.SPAWN_HITS,
        spawning: null,
        notifyWhenAttacked: true
    }];

    if(!request.user.cpu) {
        return q.reject('no cpu');
    }

    if(request.user.lastRespawnDate && Date.now() - request.user.lastRespawnDate < 180000) {
        return q.reject('too soon after last respawn');
    }

    var gameTime;

    return checkGame(request)
    .then(() => common.getGametime())
    .then((data) => gameTime = data)
    .then(() => db['rooms.objects'].count({user: ""+request.user._id})
    .then((objectsCnt) => objectsCnt > 0 ? q.reject('already playing') : true))
    .then(() => checkController(request.body.room, 'spawn', 'spawn', request.user._id))
    .then(() => checkConstructionSpot(request.body.room, 'spawn', x, y))
    // OK
    .then(() => db['rooms.objects'].removeWhere({$and: [{room: request.body.room}, {user: {$ne: null}}, {type: {$in: ['creep','constructionSite']}}]}))
    .then(() => db['rooms.objects'].find({$and: [{room: request.body.room}, {user: {$ne: null}}, {type: {$in: _.keys(C.CONSTRUCTION_COST)}}]}))
    .then(objects => objects.length ? db['rooms.objects'].insert(objects.map(i => ({
        type: 'ruin',
        user: i.user,
        room: i.room,
        x: i.x,
        y: i.y,
        structure: {
            id: i._id.toString(),
            type: i.type,
            hits: 0,
            hitsMax: i.hitsMax,
            user: ""+i.user
        },
        store: i.store || {},
        destroyTime: gameTime,
        decayTime: gameTime + 100000
    }))) : q.when())
    .then(() => db['rooms.objects'].removeWhere({$and: [{room: request.body.room}, {user: {$ne: null}}, {type: {$in: _.keys(C.CONSTRUCTION_COST)}}]}))
    .then(() => db['rooms.objects'].update({$and: [{room: request.body.room}, {type: 'controller'}, {level: 0}]},
        {$set: {user: ""+request.user._id, level: 1, progress: 0, downgradeTime: null, safeMode: gameTime + 20000}}))
    .then(() => db['rooms.objects'].update({$and: [{room: request.body.room}, {type: 'source'}]},
        {$set: {invaderHarvested: 0}}))
    .then(() => db['rooms.objects'].insert(objectsToInsert))
    .then(() => db.rooms.update({_id: request.body.room},
        {$set: {active: true, invaderGoal: 1000000}}))
    .then(() => db['rooms.terrain'].findOne({room: request.body.room}))
    .then(() => db.users.update({_id: request.user._id}, {$set: {active: 10000}}))
    .then(() => new Object({newbie: true}));
}));

router.post('/create-flag', auth.tokenAuth, jsonResponse((request) => {

    if(!_.isNumber(request.body.x) || request.body.x < 0 || request.body.x > 49 ||
    !_.isNumber(request.body.y) || request.body.y < 0 || request.body.y > 49 ||
    !_.isString(request.body.name) ||
    request.body.name.length > 60 ||
    !_.contains(C.COLORS_ALL, request.body.color) ||
    !_.contains(C.COLORS_ALL, request.body.secondaryColor)) {

        return q.reject('invalid params');
    }

    return checkGame(request)
    .then(() => getFlags(request.user._id))
    .then(rooms => {
        var roomToDelete = _.findKey(rooms, flags => _.any(flags, i => i[0] == request.body.name));
        if(roomToDelete) {
            var flags = rooms[roomToDelete];
            _.remove(flags, i => i[0] == request.body.name);
            return setFlags(request.user._id, roomToDelete, flags);
        }
    })
    .then(() => getFlags(request.user._id))
    .then(flags => {
        var cnt = _.sum(flags, i => i.length);
        if(cnt >= C.FLAGS_LIMIT) {
            return q.reject('flags limit exceeded');
        }
        var roomFlags = flags[request.body.room] || [];
        roomFlags.push([request.body.name, request.body.color, request.body.secondaryColor, request.body.x, request.body.y]);
        return setFlags(request.user._id, request.body.room, roomFlags);
    });
}));


router.post('/gen-unique-flag-name', auth.tokenAuth, jsonResponse((request) => {

    return getFlags(request.user._id)
    .then(rooms => {
        var c = 0;

        do {
            c++;
        }
        while(_.any(rooms, flags => _.any(flags, i => i[0] == 'Flag'+c)));

        return {name: 'Flag'+c};
    });
}));

router.post('/check-unique-flag-name', auth.tokenAuth, jsonResponse((request) => {

    return getFlags(request.user._id)
    .then(rooms => {
        if(_.any(rooms, flags => _.any(flags, i => i[0] == request.body.name))) {
            return q.reject('name exists');
        }
        return {};
    })
}));

router.post('/change-flag-color', auth.tokenAuth, jsonResponse((request, response) => {

    if(!_.contains(C.COLORS_ALL, request.body.color)) {
        return q.reject('invalid params');
    }
    if(!_.contains(C.COLORS_ALL, request.body.secondaryColor)) {
        return q.reject('invalid params');
    }

    return getFlags(request.user._id, request.body.room)
    .then(flags => {
        var flag = _.find(flags, i => i[0] == request.body.name);
        if(flag) {
            flag[1] = request.body.color;
            flag[2] = request.body.secondaryColor;
        }
        return setFlags(request.user._id, request.body.room, flags);
    });
}));

router.post('/remove-flag', auth.tokenAuth, jsonResponse((request, response) => {

    return getFlags(request.user._id, request.body.room)
    .then(flags => {
        _.remove(flags, i => i[0] == request.body.name);
        return setFlags(request.user._id, request.body.room, flags);
    });
}));

router.post('/add-object-intent', auth.tokenAuth, jsonResponse((request) => {

    return checkGame(request)
    .then(() => {
        if(request.body.name == 'activateSafeMode') {
            return common.getGametime()
            .then(gameTime => db['rooms.objects'].count({$and: [{type: 'controller'}, {user: ''+request.user._id}, {safeMode: {$gt: gameTime}}]}))
            .then(count => count > 0 ? q.reject('safe mode active already') : undefined)
        }
    })
    .then(() => db['rooms.intents'].update({room: request.body.room},
    {$merge: {users: {[request.user._id.toString()]: {objectsManual: {[request.body._id]: {[request.body.name]: request.body.intent}}}}}},
    {upsert: true}))
    .then(() => db.rooms.update({_id: request.body.room}, {$set: {active: true}}));
}));

router.post('/create-construction', auth.tokenAuth, jsonResponse((request) => {

    var x = parseInt(request.body.x),
        y = parseInt(request.body.y),
        structureType = request.body.structureType;

    if(x < 0 || x > 49 || y < 0 || y > 49 ||
        !C.CONSTRUCTION_COST[structureType] ||
        request.body.name && (!_.isString(request.body.name) || request.body.name.length > 50)) {

        return q.reject('invalid params');
    }

    if(structureType == 'spawn' && !request.body.name) {
        return q.reject('invalid params');
    }


    var result = checkGame(request)
        .then(() => checkConstructionSpot(request.body.room, structureType, x, y))
        .then(() => checkController(request.body.room, 'construct', structureType, request.user._id));

    var progressTotal = C.CONSTRUCTION_COST[structureType];
    if (structureType == 'road') {
        result = result.then(() => {
            return checkForTerrainAbsence(request.body.room, x, y, C.TERRAIN_MASK_SWAMP)
                .catch(() => progressTotal *= C.CONSTRUCTION_COST_ROAD_SWAMP_RATIO);
        });
        result = result.then(() => {
            return checkForTerrainAbsence(request.body.room, x, y, C.TERRAIN_MASK_WALL)
                .catch(() => progressTotal *= C.CONSTRUCTION_COST_ROAD_WALL_RATIO);
        });
    }

    result = result.then(() => db['rooms.objects'].count({$and: [{type: 'constructionSite'}, {user: ""+request.user._id}]}))
    .then((count) => count >= C.MAX_CONSTRUCTION_SITES ? q.reject('too many') : true);

    return result.then(() => db['rooms.objects'].insert({
        type: 'constructionSite',
        room: request.body.room,
        x,
        y,
        structureType,
        name: request.body.name,
        user: request.user._id.toString(),
        progress: 0,
        progressTotal
    }))
    .then((data) => {
        return db.rooms.update({_id: request.body.room}, {$set: {active: true}})
        .then(() => ({_id: data._id}));
    });
}));

router.get('/room-overview', auth.tokenAuth, jsonResponse((request) => {

    // TODO

    return db['rooms.objects'].findOne({$and: [{type: 'controller'}, {room: request.query.room}]})
    .then((data) => {
        if(!data || !data.user) {
            return null;
        }
        return db.users.findOne({_id: data.user});
    })
    .then(user => {
        return {
            owner: user ? _.pick(user, ['username','badge']) : null,
            stats: {},
            statsMax: {},
            totals: {}
        };
    })
}));

router.post('/set-notify-when-attacked', auth.tokenAuth, jsonResponse((request) => {
    return db['rooms.objects'].findOne({_id: request.body._id})
    .then((object) => {
        if(object.user) {
            if(object.user == ""+request.user._id) {
                return true;
            }
            else {
                return q.reject('not owner');
            }
        }
        return db['rooms.objects'].findOne({$and: [{room: object.room}, {type: 'controller'}]});
    })
    .then((controller) => {
        if(controller !== true && controller.user != ""+request.user._id) {
            return q.reject('not controller owner');
        }
        return db['rooms.objects'].update({_id: request.body._id},
            {$set: {notifyWhenAttacked: !!request.body.enabled}});
    });
}));

router.get('/time', jsonResponse((request) => {
    return common.getGametime().then(time => ({time}));
}));


router.post('/create-invader', auth.tokenAuth, jsonResponse((request) => {

    return db['rooms.objects'].find({$and: [{type: 'creep'}, {room: request.body.room}]})
    .then(creeps => {
        if(_.filter(creeps, {user: '2'}).length >= 5) {
            return q.reject('too many invaders exist');
        }
        if(_.filter(creeps, i => i.user != '2' && i.user != request.user._id).length > 0) {
            return q.reject('hostiles present');
        }
    })
    .then(() => db['rooms.objects'].findOne({$and: [{type: 'controller'}, {room: request.body.room}]}))
    .then(controller => {
        if(!controller || controller.user != request.user._id && (!controller.reservation || controller.reservation.user != request.user._id)) {
            return q.reject('not owned');
        }
        var body = {
            bigHealer: ['move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'heal', 'move'],
            bigRanged: ['tough', 'tough', 'tough', 'tough', 'tough', 'tough', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'work', 'move'],
            bigMelee: ['tough', 'tough', 'tough', 'tough', 'tough', 'tough', 'tough', 'tough', 'tough', 'tough', 'tough', 'tough', 'tough', 'tough', 'tough', 'tough', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'move', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'work', 'work', 'work', 'work', 'attack', 'attack', 'move'],
            smallHealer: ['move', 'move', 'move', 'move', 'heal', 'heal', 'heal', 'heal', 'heal', 'move'],
            smallRanged: ['tough', 'tough', 'move', 'move', 'move', 'move', 'ranged_attack', 'ranged_attack', 'ranged_attack', 'move'],
            smallMelee: ['tough', 'tough', 'move', 'move', 'move', 'move', 'ranged_attack', 'work', 'attack', 'move']
        };

        var creepBody = body[request.body.size + request.body.type];

        var creep = {
            type: 'creep',
            user: '2',
            body: _.map(creepBody, type => ({type, hits: 100})),
            hits: creepBody.length * 100,
            hitsMax: creepBody.length * 100,
            ticksToLive: 1500,
            x: request.body.x,
            y: request.body.y,
            room: request.body.room,
            fatigue: 0,
            store: {},
            storeCapacity: 0,
            name: `invader_${request.body.room}_${Math.floor(Math.random() * 1000)}`,
            userSummoned: ''+request.user._id
        };

        if (request.body.boosted) {
            creep.body.forEach(i => {
                if (i.type == 'heal') {
                    i.boost = 'LO';
                }
                if (i.type == 'ranged_attack') {
                    i.boost = 'KO';
                }
                if (i.type == 'work') {
                    i.boost = 'ZH';
                }
                if (i.type == 'attack') {
                    i.boost = 'UH';
                }
            })
        }

        return db['rooms.objects'].insert(creep);
    });
}));

router.post('/remove-invader', auth.tokenAuth, jsonResponse(request => {
    return db['rooms.objects'].findOne({_id: request.body._id})
    .then(object => {
        if(!object || object.userSummoned != request.user._id) {
            return q.reject('invalid object');
        }
        return db['rooms.objects'].removeWhere({_id: object._id});
    })
}));

router.get('/world-size', jsonResponse(request => {
    return (worldSize ? q.when() :
        db.rooms.find({}, {_id: true})
            .then(common.calcWorldSize)
            .then(_worldSize => worldSize = _worldSize))
        .then(() => ({width: worldSize, height: worldSize}));
}));

router.post('/add-global-intent', auth.tokenAuth, jsonResponse((request) => {
    return db['users.intents'].insert({
        user: request.user._id,
        intents: {
            [request.body.name]: [request.body.intent]
        }
    });
}));

router.get('/tick', jsonResponse((request) => {
    return {tick: _.min(lastTicks)};
}));

pubsub.subscribe('roomsDone', () => {
    if(lastTime) {
        var elapsed = Date.now() - lastTime;
        lastTicks.unshift(elapsed);
        if(lastTicks.length > 30) {
            lastTicks.splice(30, Number.MAX_VALUE);
        }
    }
    lastTime = Date.now();
});


router.use('/market', require('./market'));
router.use('/power-creeps', require('./power-creeps'));

module.exports = router;
