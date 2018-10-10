const _ = require('lodash'),
    q = require('q'),
    common = require('@screeps/common'),
    C = common.configManager.config.common.constants,
    utils = require('../utils');

const ownedStructureTypes = [
    C.STRUCTURE_TOWER,
    C.STRUCTURE_RAMPART
];

const templates = {
    'bunker1': {
        description: 'Level 1 bunker-style Stronghold',
        rewardLevel: 1,
        structures: [
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy:  1 },
            { type: C.STRUCTURE_TOWER,      dx:  1, dy:  1 },
            { type: C.STRUCTURE_CONTAINER,  dx:  1, dy:  0 }
        ]
    },
    'bunker2': {
        description: 'Level 2 bunker-style Stronghold',
        rewardLevel: 2,
        structures: [
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy:  1 },
            { type: C.STRUCTURE_TOWER,      dx:  1, dy:  1 },
            { type: C.STRUCTURE_CONTAINER,  dx:  1, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy: -1 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy: -1 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy: -1 },
            { type: C.STRUCTURE_TOWER,      dx: -1, dy: -1 },
            { type: C.STRUCTURE_CONTAINER,  dx: -1, dy:  0 }
        ]
    },
    'bunker3': {
        description: 'Level 3 bunker-style Stronghold',
        rewardLevel: 3,
        structures: [
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy:  1 },
            { type: C.STRUCTURE_TOWER,      dx:  1, dy:  1 },
            { type: C.STRUCTURE_CONTAINER,  dx:  1, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy: -1 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy: -1 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy: -1 },
            { type: C.STRUCTURE_TOWER,      dx: -1, dy: -1 },
            { type: C.STRUCTURE_CONTAINER,  dx: -1, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx: -2, dy: -1 },
            { type: C.STRUCTURE_RAMPART,    dx: -2, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx: -2, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx: -2, dy:  2 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy:  2 },
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy:  2 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy:  2 },
            { type: C.STRUCTURE_TOWER,      dx: -1, dy:  1 },
            { type: C.STRUCTURE_CONTAINER,  dx:  0, dy:  1 }
        ]
    },
    'bunker4': {
        description: 'Level 4 bunker-style Stronghold',
        rewardLevel: 4,
        structures: [
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy:  1 },
            { type: C.STRUCTURE_TOWER,      dx:  1, dy:  1 },
            { type: C.STRUCTURE_CONTAINER,  dx:  1, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy: -1 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy: -1 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy: -1 },
            { type: C.STRUCTURE_TOWER,      dx: -1, dy: -1 },
            { type: C.STRUCTURE_CONTAINER,  dx: -1, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx: -2, dy: -1 },
            { type: C.STRUCTURE_RAMPART,    dx: -2, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx: -2, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx: -2, dy:  2 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy:  2 },
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy:  2 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy:  2 },
            { type: C.STRUCTURE_TOWER,      dx: -1, dy:  1 },
            { type: C.STRUCTURE_CONTAINER,  dx:  0, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx:  2, dy: -2 },
            { type: C.STRUCTURE_RAMPART,    dx:  2, dy: -1 },
            { type: C.STRUCTURE_RAMPART,    dx:  2, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx:  2, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx:  2, dy:  2 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy: -2 },
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy: -2 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy: -2 },
            { type: C.STRUCTURE_RAMPART,    dx: -2, dy: -2 },
            { type: C.STRUCTURE_TOWER,      dx:  1, dy: -1 },
            { type: C.STRUCTURE_CONTAINER,  dx:  0, dy: -1 }
        ]
    },
    'bunker5': {
        description: 'Level 5 bunker-style Stronghold',
        rewardLevel: 5,
        structures: [
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy:  1 },
            { type: C.STRUCTURE_TOWER,      dx:  1, dy:  1 },
            { type: C.STRUCTURE_CONTAINER,  dx:  1, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy: -1 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy: -1 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy: -1 },
            { type: C.STRUCTURE_TOWER,      dx: -1, dy: -1 },
            { type: C.STRUCTURE_CONTAINER,  dx: -1, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx: -2, dy: -1 },
            { type: C.STRUCTURE_RAMPART,    dx: -2, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx: -2, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx: -2, dy:  2 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy:  2 },
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy:  2 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy:  2 },
            { type: C.STRUCTURE_TOWER,      dx: -1, dy:  1 },
            { type: C.STRUCTURE_CONTAINER,  dx:  0, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx:  2, dy: -2 },
            { type: C.STRUCTURE_RAMPART,    dx:  2, dy: -1 },
            { type: C.STRUCTURE_RAMPART,    dx:  2, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx:  2, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx:  2, dy:  2 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy: -2 },
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy: -2 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy: -2 },
            { type: C.STRUCTURE_RAMPART,    dx: -2, dy: -2 },
            { type: C.STRUCTURE_TOWER,      dx:  1, dy: -1 },
            { type: C.STRUCTURE_CONTAINER,  dx:  0, dy: -1 },
            { type: C.STRUCTURE_RAMPART,    dx: -3, dy: -2 },
            { type: C.STRUCTURE_RAMPART,    dx: -3, dy: -1 },
            { type: C.STRUCTURE_RAMPART,    dx: -3, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx: -3, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx: -3, dy:  2 },
            { type: C.STRUCTURE_RAMPART,    dx: -2, dy: -3 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy: -3 },
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy: -3 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy: -3 },
            { type: C.STRUCTURE_RAMPART,    dx:  2, dy: -3 },
            { type: C.STRUCTURE_RAMPART,    dx:  3, dy: -2 },
            { type: C.STRUCTURE_RAMPART,    dx:  3, dy: -1 },
            { type: C.STRUCTURE_RAMPART,    dx:  3, dy:  0 },
            { type: C.STRUCTURE_RAMPART,    dx:  3, dy:  1 },
            { type: C.STRUCTURE_RAMPART,    dx:  3, dy:  2 },
            { type: C.STRUCTURE_RAMPART,    dx: -2, dy:  3 },
            { type: C.STRUCTURE_RAMPART,    dx: -1, dy:  3 },
            { type: C.STRUCTURE_RAMPART,    dx:  0, dy:  3 },
            { type: C.STRUCTURE_RAMPART,    dx:  1, dy:  3 },
            { type: C.STRUCTURE_RAMPART,    dx:  2, dy:  3 },
            { type: C.STRUCTURE_TOWER,      dx:  0, dy: -2 },
            { type: C.STRUCTURE_TOWER,      dx:  0, dy:  2 },
            { type: C.STRUCTURE_CONTAINER,  dx: -2, dy:  0 },
            { type: C.STRUCTURE_CONTAINER,  dx:  2, dy:  0 }
        ]
    }
};

exports.templates = templates;

exports.spawnStronghold = function(roomName, opts, scope)
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
    ]).then(result => {
        const terrain = result[0].terrain;
        const objects = result[1];
        const templateNames = opts.templateName ? [opts.templateName] : _.keys(templates);

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
                        if(_.reduce(templates[t].structures, (r,s) => r && !common.checkTerrain(terrain, x+s.dx, y+s.dy, C.TERRAIN_MASK_WALL) && !_.some(objects, {x: x+s.dx, y: y+s.dy}), true)) {
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
        const selectedTemplate = templates[spot.templateName];
        const nextDecayTime = gameTime + C.STRONGHOLD_DECAY_TICKS;

        const objectOptions = {};
        objectOptions[C.STRUCTURE_RAMPART] = {
            hits: C.STRONGHOLD_RAMPART_HITS[selectedTemplate.rewardLevel],
            hitsMax: C.RAMPART_HITS_MAX[8]
        };
        objectOptions[C.STRUCTURE_TOWER] = {
            hits: C.TOWER_HITS,
            hitsMax: C.TOWER_HITS,
            energy: C.TOWER_CAPACITY,
            energyCapacity: C.TOWER_CAPACITY,
            actionLog: {attack: null, heal: null, repair: null}
        };
        objectOptions[C.STRUCTURE_CONTAINER] = {
            notifyWhenAttacked: false,
            hits: C.CONTAINER_HITS,
            hitsMax: C.CONTAINER_HITS,
            energyCapacity: 0
        };

        ownedStructureTypes.forEach(function(t){
            objectOptions[t] = _.merge(objectOptions[t]||{}, {user: opts.user || "2"});
        });

        const structures =
            _.map(
                selectedTemplate.structures,
                i => _.merge(
                    {
                        x: 0+spot.x+i.dx,
                        y: 0+spot.y+i.dy,
                        room: ""+roomName,
                        type: i.type,
                        nextDecayTime
                    },
                    objectOptions[i.type]||{}));

        // TODO: rework and implement rewards loading

        return db['rooms.objects'].insert(structures);
    });
};
