const _ = require('lodash');
const common = require('@screeps/common');
const config = common.configManager.config;
const C = config.common.constants;
const db = common.storage.db;
const env = common.storage.env;
const q = require('q');
const png = require('pngjs').PNG;
const fs = require('fs');
const path = require('path');

exports.roomNameFromXY = function(x,y) {
    if(x < 0) {
        x = 'W'+(-x-1);
    }
    else {
        x = 'E'+(x);
    }
    if(y < 0) {
        y = 'N'+(-y-1);
    }
    else {
        y = 'S'+(y);
    }
    return ""+x+y;
}

exports.roomNameToXY = function(name) {
    var [match,hor,x,ver,y] = name.match(/^(\w)(\d+)(\w)(\d+)$/);
    if(hor == 'W') {
        x = -x-1;
    }
    else {
        x = +x;
        //x--;
    }
    if(ver == 'N') {
        y = -y-1;
    }
    else {
        y = +y;
        //y--;
    }
    return [x,y];
}

exports.translateModulesFromDb = function(modules) {
    modules = modules || {};

    for(var key in modules) {
        var newKey = key.replace(/\$DOT\$/g, '.');
        newKey = newKey.replace(/\$SLASH\$/g, '/');
        newKey = newKey.replace(/\$BACKSLASH\$/g, '\\');
        if(newKey != key) {
            modules[newKey] = modules[key];
            delete modules[key];
        }
    }
    return modules;
};

exports.translateModulesToDb = function(modules) {
    modules = modules || {};

    for(var key in modules) {
        var newKey = key.replace(/\./g,'$DOT$');
        newKey = newKey.replace(/\//g,'$SLASH$');
        newKey = newKey.replace(/\\/g,'$BACKSLASH$');

        if(newKey[0] == '$') {
            delete modules[key];
            continue;
        }

        if(newKey != key) {
            modules[newKey] = modules[key];
            delete modules[key];
        }
    }

    if(!modules.main) {
        modules.main = '';
    }

    return modules;
};

exports.getUserWorldStatus = function(user) {
    return db['rooms.objects'].count({user: ""+user._id})
    .then((objectsCnt) => {
        if(!objectsCnt) {
            return {status: 'empty'};
        }
        return db['rooms.objects'].find({$and: [
            {user: ""+user._id},
            {type: {$in: ['spawn','controller']}}
        ]}).then((objects) => {
            var spawns = false;
            if(objects) {
                objects.forEach((i) => {
                    if (i.type == 'spawn') {
                        if(!_.any(objects, {type: 'controller', room: i.room, user: i.user})) {
                            return;
                        }
                        spawns = true;
                    }
                })
            }
            return {status: spawns ? 'normal' : 'lost'};
        })
    })
};


exports.respawnUser = async function(userId) {
    return db['users'].findOne({username: C.SYSTEM_USERNAME})
        .then(async systemUser => {
            if(!systemUser) {
                return q.reject('no system user');
            }
            const gameTime = await common.getGametime();
            await db['rooms.objects'].removeWhere({$and: [{user: ""+userId}, {type: {$in: ['creep','powerCreep','constructionSite']}}]});
            await db['users.power_creeps'].removeWhere({user: ""+userId});
            const objects = await db['rooms.objects'].find({user: "" + userId, type: {$in: _.keys(C.CONSTRUCTION_COST)}});
            if(objects.length) {
                await db['rooms.objects'].insert(objects.map(i => ({
                    type: 'ruin',
                    user: ""+systemUser._id,
                    room: i.room,
                    x: i.x,
                    y: i.y,
                    structure: {
                        id: i._id,
                        type: i.type,
                        hits: 0,
                        hitsMax: i.hitsMax,
                        user: ""+systemUser._id
                    },
                    store: i.store || {},
                    destroyTime: gameTime,
                    decayTime: gameTime + 500000
                })));
            }
            await db['rooms.objects'].update({user: "" + userId, type: 'ruin'}, {$set: {user: ""+systemUser._id}});
            await db['rooms.objects'].removeWhere({user: "" + userId, type: {$ne: 'controller'}});
            await db['rooms.flags'].removeWhere({user: ""+userId});
            const controllers = db['rooms.objects'].find({$and: [{user: ""+userId}, {type: 'controller'}]});
            for(let i in controllers) {
                await db.rooms.update({_id: controllers[i].room}, {$set: {status: 'normal'}});
            }
            await db['rooms.objects'].update({$and: [{user: "" + userId}, {type: 'controller'}]}, {
                $set: {
                    level: 0,
                    hits: 0,
                    hitsMax: 0,
                    progress: 0,
                    progressTotal: 0,
                    user: null,
                    downgradeTime: null,
                    safeMode: null,
                    safeModeAvailable: 0,
                    safeModeCooldown: null
                }
            });
        })
        .then(() => db['users'].update({_id: "" + userId}, {$set: {rooms: []}}));
};

exports.withHelp = function(array) {
    var fn = array[1];
    fn._help = array[0];
    return fn;
};

exports.generateCliHelp = function(prefix, container) {
    return `Available methods:\r\n`+Object.keys(container).filter(i => typeof container[i] == 'function').map(i => ' - ' + prefix + (container[i]._help || i)).join('\r\n');
};

exports.writePng = function(colors, width, height, filename) {

    var image = new png({width, height});

    for(var y=0; y<height; y++) {
        for(var x=0; x<width; x++) {
            var idx = (width*y + x) << 2;

            image.data[idx] = colors[y][x][0];
            image.data[idx+1] = colors[y][x][1];
            image.data[idx+2] = colors[y][x][2];
            image.data[idx+3] = colors[y][x][3] === undefined ? 255 : colors[y][x][3];
        }
    }

    var defer = q.defer();
    image.pack().pipe(fs.createWriteStream(filename)).on('finish', () => defer.resolve());
    return defer.promise;
};

exports.createTerrainColorsMap = function(terrain, zoomIn) {
    var colors = {},
        width = 50, height = 50;

    for(var y=0; y<height; y++) {
        if(zoomIn) {
            colors[y * 3] = {};
            colors[y * 3 + 1] = {};
            colors[y * 3 + 2] = {};
        }
        else {
            colors[y] = {};
        }
        for(var x=0; x<width; x++) {

            var color;
            if(common.checkTerrain(terrain,x,y,C.TERRAIN_MASK_WALL)) {
                color = [0,0,0];
            }
            else if(common.checkTerrain(terrain,x,y,C.TERRAIN_MASK_SWAMP)) {
                color = [35,37,19];
            }
            else if(x == 0 || y == 0 || x == 49 || y == 49) {
                color = [50,50,50];
            }
            else {
                color = [43,43,43];
            }
            if(zoomIn) {
                for (var dx = 0; dx < 3; dx++) {
                    for (var dy = 0; dy < 3; dy++) {
                        colors[y * 3 + dy][x * 3 + dx] = color;
                    }
                }
            }
            else {
                colors[y][x] = color;
            }
        }
    }

    return colors;
};

exports.writeTerrainToPng = function(terrain, filename, zoomIn) {

    var colors = exports.createTerrainColorsMap(terrain, zoomIn);
    return exports.writePng(colors, 50*(zoomIn?3:1), 50*(zoomIn?3:1), filename);
};

exports.loadBot = function(name) {
    var dir = config.common.bots[name];
    if(!dir) {
        throw new Error(`Bot AI with the name "${name}" doesn't exist`);
    }
    var stat = fs.statSync(dir);
    if (!stat.isDirectory()) {
        throw new Error(`"${dir}" is not a directory`);
    }
    fs.statSync(path.resolve(dir, 'main.js'));
    var files = fs.readdirSync(dir), modules = {};
    files.forEach(file => {
        var m = file.match(/^(.*)\.js$/);
        if(!m) {
            return;
        }
        modules[m[1]] = fs.readFileSync(path.resolve(dir, file), {encoding: 'utf8'});
    });
    return exports.translateModulesToDb(modules);
};

exports.reloadBotUsers = function(name) {

    return db.users.find({bot: name})
        .then(users => {
            if(!users.length) {
                return 'No bot players found';
            }
            var modules = exports.loadBot(name);
            var timestamp = Date.now();

            return db['users.code'].insert(users.map(i => ({
                user: i._id,
                branch: 't'+timestamp,
                timestamp,
                activeWorld: true,
                activeSim: true,
                modules
            })))
            .then(() => db['users.code'].removeWhere({$and: [
                {user: {$in: users.map(i => i._id)}},
                {branch: {$ne: 't'+timestamp}}
            ]}))
                .then(() => 'Reloaded scripts for users: '+users.map(i => i.username).join(', '));
        })
};

exports.isBus = function isBus(coord) {
    return coord < 0 && (coord+1) % 10 == 0 || coord > 0 && (coord) % 10 == 0 || coord == 0;
};

exports.isCenter = function isCenter(x,y) {
    return (x < 0 && Math.abs(x+1)%10 >= 4 && Math.abs(x+1)%10 <= 6 || x >= 0 && Math.abs(x)%10 >= 4 && Math.abs(x)%10 <= 6) &&
        (y < 0 && Math.abs(y+1)%10 >= 4 && Math.abs(y+1)%10 <= 6 || y >= 0 && Math.abs(y)%10 >= 4 && Math.abs(y)%10 <= 6);
};

exports.isVeryCenter = function isVeryCenter(x,y) {
    return (x < 0 && Math.abs(x+1)%10 == 5 || x >= 0 && Math.abs(x)%10 == 5) &&
        (y < 0 && Math.abs(y+1)%10 == 5 || y >= 0 && Math.abs(y)%10 == 5);
};

exports.findFreePos = function findFreePos(roomName, distance, rect, exclude) {
    if(!rect) {
        rect = {x1: 4, x2: 45, y1: 4, y2: 45};
    }

    return q.all([
        db['rooms.objects'].find({room: roomName}),
        db['rooms.terrain'].findOne({room: roomName})])
        .then(([objects, terrain]) => {
            if (!terrain) {
                return q.reject();
            }
            var x, y, spot, hasObjects, counter = 0;
            do {

                x = rect.x1 + Math.floor(Math.random() * (rect.x2 - rect.x1));
                y = rect.y1 + Math.floor(Math.random() * (rect.y2 - rect.y1));
                if(exclude && exclude.x == x && exclude.y == y) {
                    continue;
                }
                spot = true;
                for (var dx = -distance; dx <= distance; dx++) {
                    for (var dy = -distance; dy <= distance; dy++) {
                        if (common.checkTerrain(terrain.terrain, x + dx, y + dy, C.TERRAIN_MASK_WALL)) {
                            spot = false;
                        }
                    }
                }
                hasObjects = _.any(objects, i => Math.abs(i.x - x) <= distance && Math.abs(i.y - y) <= distance &&
                    C.OBSTACLE_OBJECT_TYPES.concat(['rampart','portal']).indexOf(object.type) != -1);
                counter++;
            }
            while ((!spot || hasObjects) && counter < 500);

            if (!spot || hasObjects) {
                return q.reject();
            }

            return {x, y};
        });
}