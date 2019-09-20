const _ = require('lodash'),
    q = require('q'),
    common = require('@screeps/common'),
    C = common.configManager.config.common.constants,
    strongholds = require('@screeps/common/lib/strongholds'),
    utils = require('../utils');

const spawnStronghold = function spawnStronghold(roomName, opts, scope)
{
    const { db, gameTime } = scope;
    opts = opts || {};

    if(!roomName) {
        return q.reject('invalid room');
    }

    if(opts.templateName && !templates[opts.templateName]) {
        q.reject('invalid template');
    }

    return q.all([
        db['rooms.terrain'].findOne({room: roomName}),
        db['rooms.objects'].find({room: roomName, type: {$in: [C.STRUCTURE_RAMPART, ...C.OBSTACLE_OBJECT_TYPES]}})
    ]).then(([{terrain}, objects]) => {
        const templateNames = opts.templateName ? [opts.templateName] : _.keys(strongholds.templates);

        const controller = _.first(objects, {type: C.STRUCTURE_CONTROLLER});
        if(controller && controller.user || controller.reservation) {
            return q.reject('room occupied');
        }

        const spots = {};
        if(!_.isUndefined(opts.templateName) && !_.isUndefined(opts.x) && !_.isUndefined(opts.y)){
            return opts;
        } else {
            for(let x = 4; x < 45; x++)
                for(let y = 4; y < 45; y++)
                    for(let t of templateNames)
                        if(_.reduce(strongholds.templates[t].structures, (r,s) => r && !common.checkTerrain(terrain, x+s.dx, y+s.dy, C.TERRAIN_MASK_WALL) && !_.some(objects, {x: x+s.dx, y: y+s.dy}), true)) {
                            if(_.isUndefined(spots[t])) {
                                spots[t] = [];
                            }
                            spots[t].push({x,y});
                        }
        }

        if(!_.some(spots)) {
            return q.reject('No spots');
        }
        const selectedTemplate = _.sample(_.keys(spots));
        const spot = _.sample(spots[selectedTemplate]);
        return {
            templateName: selectedTemplate,
            x: spot.x,
            y: spot.y
        };
    }).then(spot => {
        const selectedTemplate = strongholds.templates[spot.templateName];
        const deployTime = gameTime + 5000;
        const user = opts.user || "2";

        const strongholdId = `${""+roomName}_${gameTime}`;
        const structures = _.reduce(selectedTemplate.structures, (acc, i) => {
            if(i.type == C.STRUCTURE_INVADER_CORE) {
                const core = _.merge({}, i, {
                    room: roomName,
                    x: 0+spot.x+i.dx,
                    y: 0+spot.y+i.dy,
                    user,
                    templateName: spot.templateName,
                    hits: C.INVADER_CORE_HITS,
                    hitsMax: C.INVADER_CORE_HITS,
                    nextExpandTime: gameTime + C.INVADER_CORE_EXPAND_TIME,
                    depositType: scope.depositType,
                    deployTime,
                    strongholdId,
                    effects: [{
                        effect: C.EFFECT_INVULNERABILITY,
                        endTime: deployTime,
                        duration: 5000
                    }]
                });
                delete core.dx;
                delete core.dy;
                acc.push(core);
            }
            if(i.type == C.STRUCTURE_RAMPART) {
                acc.push({
                    type: C.STRUCTURE_RAMPART,
                    room: roomName,
                    x: 0+spot.x+i.dx,
                    y: 0+spot.y+i.dy,
                    user,
                    hits: 1,
                    hitsMax: 1,
                    isPublic: true,
                    nextDecayTime: deployTime
                });
            }
            return acc;
        }, []);

        return db['rooms.objects'].insert(structures)
            .then(()=> db['rooms'].update({_id: roomName}, {$set: {active: true}}));
    });
};

const selectRoom = function selectRoom(sectorCenter, scope) {
    const sectorRegex = sectorCenter._id.replace(/^([WE]\d*)5([NS]\d*)5$/, (str, p1, p2) => `^${p1}\\d${p2}\\d$`);
    return q.all([
        scope.db['rooms'].find({_id: {$regex: sectorRegex}}),
        scope.db['rooms.objects'].find({type: {$in: ['creep', 'controller']}, room: {$regex: sectorRegex}})
    ])
        .then(([sectorRooms, sectorObjects]) => {
            scope.depositType = _.sample(_.keys(strongholds.coreRewards));

            const possibleRooms = _.filter(
                sectorRooms,
                r => {
                    if(r.bus || r._id.match('0$') || r._id.match('0[NS]')) {
                        return false;
                    }
                    const controller = _(sectorObjects).filter({type: 'controller', room: r._id}).first();
                    if(!controller) {
                        return true;
                    }
                    if(!!controller.user || !!controller.reservation) {
                        return false;
                    }

                    return !_.some(sectorObjects, o => o.room==r._id && o.type == 'creep' && _.some(o.body, {type: 'claim'}));
                });
            if(_.some(possibleRooms)) {
                const room = _.sample(possibleRooms);
                return spawnStronghold(room._id, {}, scope);
            }
        });
};

exports.spawnStronghold = spawnStronghold;
exports.selectRoom = selectRoom;
exports.templates = strongholds.templates;
