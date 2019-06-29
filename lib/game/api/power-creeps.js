var express = require('express'),
    router = express.Router(),
    q = require('q'),
    _ = require('lodash'),
    jsonResponse = require('q-json-response'),
    auth = require('./auth'),
    utils = require('../../utils'),
    common = require('@screeps/common'),
    db = common.storage.db,
    env = common.storage.env,
    C = common.configManager.config.common.constants;

function calcFreePowerLevels(user, userPowerCreeps) {
    var level = Math.floor(Math.pow((user.power || 0) / C.POWER_LEVEL_MULTIPLY, 1 / C.POWER_LEVEL_POW));
    var used = userPowerCreeps.length + _.sum(userPowerCreeps, 'level');
    return level - used;
}

router.get('/list', auth.tokenAuth, jsonResponse((request) => {
    return q.all([
        db['users.power_creeps'].find({user: request.user._id}),
        db['rooms.objects'].find({type: 'powerCreep', user: request.user._id})
    ])
        .then(([userPowerCreeps, roomPowerCreeps]) => {
            userPowerCreeps.forEach(creep => {
                var roomObject = _.find(roomPowerCreeps, i => i._id == creep._id);
                if(roomObject) {
                    Object.assign(creep, roomObject);
                }
            });
            return {list: userPowerCreeps};
        })
}));

router.post('/create', auth.tokenAuth, jsonResponse((request) => {

    return db['users.power_creeps'].find({user: request.user._id})
        .then(userPowerCreeps => {
            if (calcFreePowerLevels(request.user, userPowerCreeps) <= 0) {
                return q.reject('not enough power level');
            }
            if (Object.values(C.POWER_CLASS).indexOf(request.body.className) === -1) {
                return q.reject('invalid class');
            }

            var name = ("" + request.body.name).substring(0, 50);

            if (_.any(userPowerCreeps, {name})) {
                return q.reject('name already exists');
            }

            return db['users.power_creeps'].insert({
                name,
                className: request.body.className,
                user: "" + request.user._id,
                level: 0,
                hitsMax: 1000,
                store: {},
                storeCapacity: 100,
                spawnCooldownTime: 0,
                powers: {}
            });
        });
}));

router.post('/delete', auth.tokenAuth, jsonResponse((request) => {
    return db['users.power_creeps'].findOne({_id: request.body.id})
        .then(creep => {
            if(!creep || creep.user != ""+request.user._id) {
                return q.reject('invalid id');
            }
            if(creep.spawnCooldownTime === null || creep.shard) {
                return q.reject('spawned');
            }
            if(creep.deleteTime) {
                return q.reject('already being deleted')
            }

            if((request.user.powerExperimentationTime || 0) > Date.now()) {
                return db['users.power_creeps'].remove({_id: request.body.id})
                    .then(data => ({result: data.result}));
            }
            else {
                return db['users.power_creeps'].update({_id: request.body.id},
                    {$set: {deleteTime: Date.now() + C.POWER_CREEP_DELETE_COOLDOWN}})
                    .then(data => ({result: data.result}));
            }
        })
}));

router.post('/cancel-delete', auth.tokenAuth, jsonResponse((request) => {
    return db['users.power_creeps'].findOne({_id: request.body.id})
        .then(creep => {
            if(!creep || creep.user != ""+request.user._id) {
                return q.reject('invalid id');
            }
            if(!creep.deleteTime) {
                return q.reject('not being deleted')
            }

            return db['users.power_creeps'].update({_id: request.body.id},
                {$unset: {deleteTime: true}})
                .then(data => ({result: data.result}));
        })
}));

router.post('/upgrade', auth.tokenAuth, jsonResponse((request) => {

    return db['users.power_creeps'].find({user: request.user._id})
        .then(userPowerCreeps => {

            var creep = _.find(userPowerCreeps, i => "" + i._id == request.body.id);
            if (!creep) {
                return q.reject('invalid id');
            }
            if(!_.isObject(request.body.powers)) {
                return q.reject('invalid powers');
            }
            for(var power in request.body.powers) {
                var powerInfo = C.POWER_INFO[power];
                if (!powerInfo) {
                    return q.reject('invalid power '+power);
                }
                if (powerInfo.className !== creep.className) {
                    return q.reject('invalid class for power '+power);
                }
                if (!creep.powers[power]) {
                    creep.powers[power] = {level: 0};
                }
                if(!_.isNumber(request.body.powers[power])) {
                    return q.reject('invalid value for power '+power);
                }
                if(request.body.powers[power] < creep.powers[power].level) {
                    return q.reject('cannot downgrade power '+power);
                }
                if(request.body.powers[power] > 5) {
                    return q.reject('invalid max value for power '+power);
                }
            }
            for(var power in creep.powers) {
                if((request.body.powers[power] || 0) < creep.powers[power].level) {
                    return q.reject('cannot downgrade power '+power);
                }
            }
            var newLevel = _.sum(request.body.powers);
            if (newLevel > C.POWER_CREEP_MAX_LEVEL) {
                return q.reject('max level');
            }
            var $merge = {powers: {}};
            for(var power in request.body.powers) {
                if(request.body.powers[power] === 0) {
                    continue;
                }
                if(newLevel < C.POWER_INFO[power].level[request.body.powers[power]-1]) {
                    return q.reject('not enough level for power '+power);
                }
                $merge.powers[power] = {level: request.body.powers[power]};
            }

            if (calcFreePowerLevels(request.user, userPowerCreeps) < newLevel - creep.level) {
                return q.reject('not enough power level');
            }

            $merge.level = newLevel;
            $merge.hitsMax = 1000 * (newLevel + 1);
            $merge.storeCapacity = 100 * (newLevel + 1);

            return q.all([
                db['users.power_creeps'].update({_id: request.body.id}, {$merge}),
                db['rooms.objects'].update({_id: request.body.id}, {$merge})
            ]);
        });
}));

router.post('/rename', auth.tokenAuth, jsonResponse((request) => {
    return db['users.power_creeps'].find({user: request.user._id})
        .then(powerCreeps => {
            var creep = _.find(powerCreeps, i => i._id == request.body.id);
            if(!creep) {
                return q.reject('invalid id');
            }
            if(creep.spawnCooldownTime === null || creep.shard) {
                return q.reject('spawned');
            }
            var name = ("" + request.body.name).substring(0, 50);

            if (_.any(powerCreeps, {name})) {
                return q.reject('name already exists');
            }

            return db['users.power_creeps'].update({_id: request.body.id}, {$set: {name}})
                .then(data => ({result: data.result}));
        })
}));

router.post('/experimentation', auth.tokenAuth, jsonResponse(request => {
    if((request.user.powerExperimentations || 0) <= 0) {
        return q.reject('no power resets');
    }
    return db['users'].update({_id: request.user._id}, {
        $inc: {powerExperimentations: -1}, $set: {powerExperimentationTime: Date.now() + 24*3600*1000}});
}));


module.exports = router;
