var express = require('express'),
    router = express.Router(),
    q = require('q'),
    _ = require('lodash'),
    common = require('@screeps/common'),
    db = common.storage.db,
    env = common.storage.env,
    jsonResponse = require('q-json-response'),
    passport = require('passport'),
    TokenStrategy = require('passport-token').Strategy,
    session = require('express-session'),
    authlib = require('../../authlib'),
    steamApi = require('steam-webapi'),
    steam;

var sessionSecret = 'gwoif31m947j925hxcy6cj4l62he';
var steamAppId = 464350;
var useNativeAuth = false;

function steamFindOrCreateUser(request, steamId) {

    var user;

    return (request.user ? q.when(request.user) : db.users.findOne({'steam.id': steamId}))
    .then((data) => {

        var steamData = {
            id: steamId
        };

        if(data) {
            user = data;

            steamData = _.extend(user.steam, steamData);

            var $set = {
                steam: steamData
            };

            user.steam = steamData;
            return db.users.update({_id: user._id}, {$set});
        }
        else {

            user = {
                steam: steamData,
                cpu: 100,
                cpuAvailable: 0,
                registeredDate: new Date(),
                credits: 0,
                gcl: 0,
                powerExperimentations: 30
            };

            return db.users.insert(user)
            .then(result => {
                user = result;
                return db['users.code'].insert({
                    user: user._id,
                    modules: {main: ''},
                    branch: 'default',
                    activeWorld: true,
                    activeSim: true
                })
            })
            .then(() => env.set('scrUserMemory:'+user._id, JSON.stringify({})))
        }
    })
    .then(() => user);
}

function setup(app, _useNativeAuth) {

    useNativeAuth = _useNativeAuth;

    if(!useNativeAuth) {
        steam = new steamApi();
    }

    passport.use( new TokenStrategy( function(email, token, done) {

        authlib.checkToken(token)
        .then((user) => {
            done(null, user);
        })
        .catch((error) => {
            error === false ? done(null, false) : done(error)
        });
    }));

    app.use(passport.initialize());
}

function tokenAuth (request, response, next) {
    passport.authenticate('token', {session: false}, function (err, user) {
        if (err) {
            return next(err);
        }
        if (!user) {
            response.status(401).send({error: 'unauthorized'});
            return;
        }
        request.user = user;
        authlib.genToken(user._id).then((token) => {
            response.set('X-Token', token);
            next();
        });
    })(request, response, next);
}

router.get('/me', tokenAuth, jsonResponse((request, response) => {

    var result = {
        _id: request.user._id,
        email: request.user.email,
        emailDirty: request.user.emailDirty,
        username: request.user.username,
        cpu: request.user.cpu,
        badge: request.user.badge,
        password: !!request.user.password,
        lastRespawnDate: request.user.lastRespawnDate,
        notifyPrefs: request.user.notifyPrefs,
        gcl: request.user.gcl,
        lastChargeTime: request.user.lastChargeTime,
        blocked: request.user.blocked,
        customBadge: request.user.customBadge,
        power: request.user.power,
        money: (request.user.money || 0) / 1000,
        steam: _.pick(request.user.steam, ['id', 'displayName', 'ownership']),
        powerExperimentations: request.user.powerExperimentations || 0,
        powerExperimentationTime: request.user.powerExperimentationTime || 0
    };

    return result;
}));

router.post('/steam-ticket', jsonResponse(request => {

    var doAuth;

    if(request.body.useNativeAuth) {
        if(!useNativeAuth) {
            return q.reject('authentication method is not supported');
        }
        var greenworks = require('../../../greenworks/greenworks');

        var decryptedTicket = greenworks.decryptAppTicket(
            Buffer.from(request.body.ticket, 'hex'),
            Buffer.from('ed66a45b50c848a0c463ec18e0eab308fe9b8d3edcb0484b2def7e52f7297e75', 'hex')
        );
        if(!greenworks.isTicketForApp(decryptedTicket, greenworks.getAppId())) {
            return q.reject('invalid encrypted ticket');
        }
        doAuth = q.when(greenworks.getTicketSteamId(decryptedTicket).getRawSteamID());
    }
    else {
        if(useNativeAuth) {
            return q.reject('authentication method is not supported');
        }
        doAuth = q.ninvoke(steam, 'authenticateUserTicket', {appid: steamAppId, ticket: request.body.ticket})
        .then(data => {
            if (data.params.result != 'OK') {
                return q.reject('could not authenticate');
            }
            return data.params.steamid;
        });
    }

    return doAuth
    .then(steamId => {
        return steamFindOrCreateUser(request, steamId)
        .then(user => {
            console.log(`Sign in: ${user.username} (${user._id}), IP=${request.ip}, steamid=${steamId}`);
            return authlib.genToken(user._id);
        })
        .then(token => ({token, steamid: steamId}));
    });
}));


exports.router = router;
exports.tokenAuth = tokenAuth;
exports.setup = setup;