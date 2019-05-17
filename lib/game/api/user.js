var express = require('express'),
    router = express.Router(),
    q = require('q'),
    _ = require('lodash'),
    jsonResponse = require('q-json-response'),
    common = require('@screeps/common'),
    auth = require('./auth'),
    db = common.storage.db,
    env = common.storage.env,
    pubsub = common.storage.pubsub,
    zlib = require('zlib'),
    btoa = require('btoa'),
    badge = require('./badge'),
    utils = require('../../utils');


router.use('/messages', require('./user-messages'));

router.get('/world-start-room', auth.tokenAuth, jsonResponse((request) => {

    return db['rooms.objects'].find({$and: [{user: ""+request.user._id}, {type: 'controller'}]})
    .then((controllers) => {
        if(controllers.length) {
            return {room: [_.shuffle(controllers)[0].room]};
        }
        return {room: ['W5N5']};
    })
}));

router.get('/world-status', auth.tokenAuth, jsonResponse((request) => {
    return db['rooms.objects'].count({$and: [{user: request.user._id}]})
    .then((objectsCnt) => {
        if(!objectsCnt) {
            return {status: 'empty'};
        }
        return db['rooms.objects'].find({$and: [
            {user: ""+request.user._id},
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
}));

router.get('/branches', auth.tokenAuth, jsonResponse((request) => {

    return db['users.code'].find({user: request.user._id})
    .then(list => {
        if (!_.any(list, {branch: 'default'})) {
            return db['users.code'].insert({
                user: request.user._id,
                branch: 'default',
                modules: {main: ''},
                timestamp: new Date()
            })
            .then(() => db['users.code'].find({user: request.user._id}))
        }
        return list;
    })
    .then(list => {
        _.forEach(list, i => {
            if(i.modules) {
                i.modules = utils.translateModulesFromDb(i.modules);
            }
        });

        return {list};
    });
}));

router.post('/code', auth.tokenAuth, jsonResponse((request) => {

    if (JSON.stringify(request.body.modules).length > 5 * 1024 * 1024) {
        return q.reject('code length exceeds 5 MB limit');
    }

    request.body.modules = utils.translateModulesToDb(request.body.modules);

    request.body.branch = request.body.branch || '$activeWorld';

    var query;

    if (request.body.branch[0] == '$') {
        var activeName = request.body.branch.substring(1);
        query = {$and: [{user: request.user._id}, {[activeName]: true}]};
    }
    else {
        query = {$and: [{user: request.user._id}, {branch: request.body.branch}]};
    }

    return db.users.update({_id: request.user._id}, {$set: {active: 10000}})
    .then(() => db['users.code'].update(query, {
        $set: {
            modules: utils.translateModulesToDb(request.body.modules),
            timestamp: new Date().getTime()
        }
    }))
    .then((data) => {
        if (!data.modified) {
            return q.reject('branch does not exist');
        }
        env.del(`scrScriptCachedData:${request.user._id}`);
        db['users.code'].findOne(query)
        .then((code) => {
            pubsub.publish(`user:${request.user._id}/code`, JSON.stringify({id: ""+code._id, hash: request.body._hash}))
        });
    })
    .then(() => ({timestamp: Date.now()}));
}));

router.get('/code', auth.tokenAuth, jsonResponse((request) => {

    request.query.branch = request.query.branch || '$activeWorld';

    var query;

    if(request.query.branch[0] == '$') {
        var activeName = request.query.branch.substring(1);
        query = {$and: [{user: request.user._id}, {[activeName]: true}]};
    }
    else {
        query = {$and: [{user: request.user._id}, {branch: request.query.branch}]};
    }

    return db['users.code'].findOne(query)
    .then((data) => {
        if (!data) {
            return q.reject('no code');
        }

        return {branch: data.branch, modules: utils.translateModulesFromDb(data.modules)};
    });
}));

router.post('/badge', auth.tokenAuth, jsonResponse((request) => {

    var colorRegex = /^#[a-f0-9]{6}/i;

    if(!_.isObject(request.body.badge) ||
    _.isNaN(+request.body.badge.param) || +request.body.badge.param < -100 || +request.body.badge.param > 100 ||
    !colorRegex.test(request.body.badge.color1) ||
    !colorRegex.test(request.body.badge.color2) ||
    !colorRegex.test(request.body.badge.color3)) {
        return q.reject('invalid params');
    }

    if(_.isNumber(request.body.badge.type) && (request.body.badge.type < 1 || request.body.badge.type > 24)) {
        return q.reject('invalid params');
    }

    if(!_.isNumber(request.body.badge.type) && !_.isEqual(request.body.badge.type, request.user.customBadge)) {
        return q.reject('invalid params');
    }

    var badge = {
        type: request.body.badge.type,
        color1: request.body.badge.color1,
        color2: request.body.badge.color2,
        color3: request.body.badge.color3,
        param: +request.body.badge.param,
        flip: !!request.body.badge.flip
    };

    return db.users.update({_id: request.user._id}, {$set: {badge}});
}));

router.get('/respawn-prohibited-rooms', auth.tokenAuth, jsonResponse((request) => {
    return {rooms: []};
}));

router.post('/respawn', auth.tokenAuth, jsonResponse((request) => {

    return utils.getUserWorldStatus(request.user)

    .then((data) => {
        if (data.status != 'normal' && data.status != 'lost') {
            return q.reject('invalid status');
        }

        return utils.respawnUser(request.user._id);
    });
}));

router.post('/set-active-branch', auth.tokenAuth, jsonResponse((request) => {
    if(!_.contains(['activeWorld','activeSim'], request.body.activeName)) {
        return q.reject('invalid params');
    }
    return db['users.code'].findOne({$and: [{user: request.user._id}, {branch: request.body.branch}]})
        .then((data) => data ? true : q.reject('no branch'))
        .then(() => db['users.code'].update({user: request.user._id}, {$set: {[request.body.activeName]: false}}))
        .then(() => db['users.code'].update({$and: [{user: request.user._id}, {branch: request.body.branch}]}, {$set: {[request.body.activeName]: true}}))
        .then(() => pubsub.publish(`user:${request.user._id}/set-active-branch`, JSON.stringify({
            activeName: request.body.activeName,
            branch: request.body.branch
        })))
}));

router.post('/clone-branch', auth.tokenAuth, jsonResponse((request) => {

    if (request.body.branch && (!_.isString(request.body.branch) || request.body.branch.length > 30)) {
        return q.reject('invalid branch name');
    }

    if (request.body.defaultModules) {
        request.body.defaultModules = utils.translateModulesToDb(request.body.defaultModules);
    }

    return db['users.code'].findOne({$and: [{user: request.user._id}, {branch: request.body.newName}]}, {})
        .then((data) => {
            if (data) {
                return;
            }
            if (/^tutorial-\d$/.test(request.body.newName)) {
                return;
            }
            return db['users.code'].count({user: request.user._id})
                .then((count) => count >= 30 ? q.reject('too many branches') : true)
        })
        .then(() => request.body.branch ? db['users.code'].findOne(
            {$and: [{user: request.user._id}, {branch: request.body.branch}]}) : null)
        .then((data) => db['users.code'].update({$and: [
            {user: request.user._id},
            {branch: request.body.newName}
        ]}, {
            $set: {
                modules: data ? data.modules : (request.body.defaultModules || {main: ''}),
                timestamp: new Date()
            }
        }, {upsert: true}))
        .then(() => db['users.code'].findOne({$and: [{user: request.user._id}, {branch: request.body.newName}]}))
        .then((code) => pubsub.publish(`user:${request.user._id}/code`, JSON.stringify({id: code._id})))
        .then(() => ({timestamp: Date.now()}));
}));

router.post('/delete-branch', auth.tokenAuth, jsonResponse((request) => {
    return db['users.code'].removeWhere({$and: [
        {user: request.user._id},
        {branch: request.body.branch},
        {activeWorld: {$ne: true}},
        {activeSim: {$ne: true}}
    ]}).then(() => ({timestamp: Date.now()}));
}));

router.get('/memory', auth.tokenAuth, jsonResponse((request) => {

    return env.get(env.keys.MEMORY+request.user._id)
        .then((data) => {

            try {
                var memory = JSON.parse(data || "{}"),
                    curPointer = memory;

                if(request.query.path) {
                    var parts = request.query.path.split(/\./);
                    while (parts.length > 0) {
                        curPointer = curPointer[parts.shift()];
                    }
                }

                if(_.isUndefined(curPointer)) {
                    return {data: curPointer};
                }

                return q.ninvoke(zlib, 'gzip', JSON.stringify(curPointer))
                    .then(gzipped => ({data: 'gz:'+btoa(gzipped)}));
            }
            catch(e) {
                console.log(e.stack);
                return {data: 'Incorrect memory path'};
            }
        });
}));

router.post('/memory', auth.tokenAuth, jsonResponse((request) => {

    var memoryString = JSON.stringify(request.body.value);

    if(memoryString && memoryString.length > 1024*1024) {
        return q.reject('memory size is too large');
    }


    var expression = `Memory`;

    if(request.body.path) {
        var parts = request.body.path.split(/\./);
        parts = _.map(parts, (i) => "['" + i.replace(/\'/g,"\\\'") + "']");
        expression = 'Memory'+parts.join('');
        if(!_.isUndefined(request.body.value)) {
            expression += `= ${memoryString}`;
        }
        else {
            expression = 'delete '+expression;
        }
    }
    else {
        expression = `for(var i in Memory) { delete Memory[i]; } _.extend(Memory,${memoryString});`;
    }

    return db['users.console'].insert({
        user: request.user._id,
        expression,
        hidden: true
    });
}));

router.get('/memory-segment', auth.tokenAuth, jsonResponse((request) => {
    var id = parseInt(request.query.segment);
    if(_.isNaN(id) || id < 0 || id > 99) {
        return q.reject('invalid segment ID');
    }
    return env.hget(env.keys.MEMORY_SEGMENTS+request.user._id, id)
        .then(data => {
            return {data};
        })
}));

router.post('/memory-segment', auth.tokenAuth, jsonResponse((request) => {
    var id = parseInt(request.body.segment);
    if(_.isNaN(id) || id < 0 || id > 99) {
        return q.reject('invalid segment ID');
    }
    if((""+request.body.data).length > 100 * 1024) {
        return q.reject("length limit exceeded");
    }
    return env.hset(env.keys.MEMORY_SEGMENTS+request.user._id, id, request.body.data)
        .then(() => ({}));
}));

router.post('/console', auth.tokenAuth, jsonResponse((request) => {

    if(JSON.stringify(request.body.expression).length > 1024) {
        return q.reject('expression size is too large');
    }

    return db['users.console'].insert({
        user: request.user._id,
        expression: request.body.expression
    });
}));

router.get('/find', jsonResponse((request) => {
    var query = {};
    if(request.query.username) {
        query = {usernameLower: request.query.username.toLowerCase()}
    }
    if(request.query.id) {
        query = {_id: request.query.id};
    }
    return db.users.findOne(query, {username: true, badge: true, gcl: true, power: true, 'steam.id': true})
        .then((user) => {
            var result = _.pick(user, ['_id','username','badge','gcl','power']);
            if(user.steam) {
                result.steam = {id: user.steam.id};
            }
            return {user: result};
        });
}));

router.get('/stats', jsonResponse((request) => {

    if(!_.contains([8,180,1440], request.query.interval|0)) {
        return q.reject('invalid params');
    }
    // TODO
    return {stats: {}};
}));

router.get('/rooms', jsonResponse((request) => {
    return db['rooms.objects'].find({$and: [{type: 'controller'}, {user: request.query.id}]})
        .then((data) => {
            data.sort((a, b) => b.level - a.level);
            var rooms = _.pluck(data, 'room');
            return {rooms};
        });
}));

router.post('/notify-prefs', auth.tokenAuth, jsonResponse((request) => {

    request.user.notifyPrefs = request.user.notifyPrefs || {};

    if(!_.isUndefined(request.body.disabled)) {
        request.user.notifyPrefs.disabled = !!request.body.disabled;
    }
    if(!_.isUndefined(request.body.disabledOnMessages)) {
        request.user.notifyPrefs.disabledOnMessages = !!request.body.disabledOnMessages;
    }
    if(!_.isUndefined(request.body.sendOnline)) {
        request.user.notifyPrefs.sendOnline = !!request.body.sendOnline;
    }
    if(_.contains([5,10,30,60,180,360,720,1440,4320], +request.body.interval)) {
        request.user.notifyPrefs.interval = +request.body.interval;
    }
    if(_.contains([0,5,10,30,60,180,360,720,1440,4320,100000], +request.body.errorsInterval)) {
        request.user.notifyPrefs.errorsInterval = +request.body.errorsInterval;
    }

    return db.users.update({_id: request.user._id}, {$set: {notifyPrefs: request.user.notifyPrefs}});
}));

router.get('/overview', auth.tokenAuth, jsonResponse((request) => {

    var roomIds;

    var interval = parseInt(request.query.interval) || 8,
        intervalsCnt = {8: 8, 180: 8, 1440: 7}[interval],
        endTime = Math.ceil(Date.now() / (interval*60*1000)),
        statName = request.query.statName || 'energyHarvested',
        statsMax,
        stats = {},
        totals = {};

    return db['rooms.objects'].find({$and: [{type: 'controller'}, {user: request.user._id}]})
        .then((data) => {
            data.sort((a, b) => b.level - a.level);
            roomIds = _.pluck(data, 'room');
            return {rooms: roomIds, stats, statsMax, totals, gametimes: []};
            // TODO
        })

}));

router.post('/tutorial-done', auth.tokenAuth, jsonResponse(request => {
}));

router.post('/email', auth.tokenAuth, jsonResponse((request) => {
    if(!/^[\w\d-\.\+&]+\@[\w\d\-\.&]+\.[\w\d\-\.&]{2,}$/.test(request.body.email)) {
        return q.reject('invalid email');
    }
    request.body.email = request.body.email.toLowerCase();

    return db.users.findOne({email: request.body.email})
        .then((data) => {
            if(data) {
                return q.reject('email already exists');
            }
            return db.users.update({_id: request.user._id}, {$set: {email: request.body.email}});
        });
}));

router.get('/money-history', auth.tokenAuth, jsonResponse((request) => {
    var pageSize = 20, page = parseInt(request.query.page) || 0;
    return db['users.money'].findEx({user: request.user._id}, {sort: {date: -1}, skip: page*pageSize, limit: pageSize+1})
        .then(data => {
            var spliced = data.splice(0, pageSize);
            return {
                page,
                list: spliced,
                hasMore: data.length > 0
            };
        })
}));

var badgeCache = {};

router.get('/badge-svg', (request, response, next) => {
    var username = request.query.username.toLowerCase();
    q.when()
        .then(() => {
            if (!badgeCache[username] || badgeCache[username].time < Date.now() - 60 * 60 * 1000) {
                return db.users.findOne({usernameLower: username})
                    .then(user => {
                        badgeCache[username] = {
                            time: Date.now(),
                            svg: user.badge ?
                                badge.getBadgeSvg(user.badge) :
                                `<svg xmlns="http://www.w3.org/2000/svg"></svg>`
                        };
                    });
            }
        })
        .then(() => {
            response.type('svg');
            response.send(badgeCache[username].svg);
        })
        .catch((e) => {
            response.sendStatus(404);
        });
});


module.exports = router;