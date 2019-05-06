var common = require('@screeps/common'),
    config = common.configManager.config,
    authlib = require('../../authlib'),
    q = require('q'),
    path = require('path'),
    _ = require('lodash'),
    net = require('net'),
    http = require('http'),
    sockjs = require('sockjs'),
    zlib = require('zlib'),
    EventEmitter = require('events').EventEmitter,
    storage = common.storage,
    db = storage.db,
    env = storage.env,
    pubsub = storage.pubsub;

Object.assign(config.backend, {
    socketModules: {
        system: require('./system'),
        rooms: require('./rooms'),
        user: require('./user'),
        map: require('./map')
    },
    socketUpdateThrottle: 200
});

module.exports = function installSocketServer(server, PROTOCOL) {
    var socketServer = sockjs.createServer(),
        eventEmitter = new EventEmitter(),
        socketModules = [],
        m;

    eventEmitter.setMaxListeners(0);

    socketServer.on('connection', function (conn) {

        if (!conn) {
            return;
        }

        conn.setMaxListeners(0);

        var gzip = false;

        conn._writeEventRaw = (message) => {
            if (gzip) {
                zlib.deflate(message, {level: 1}, (err, data) => {
                    var gzippedMessage = 'gz:' + data.toString('base64');
                    if (gzippedMessage.length < message.length) {
                        message = gzippedMessage;
                    }
                    conn.write(message);
                });
            }
            else {
                conn.write(message);
            }
        };

        conn._writeEvent = (channel, data) => {
            var message = JSON.stringify([channel, data]);
            conn._writeEventRaw(message);
        };

        var listener = function (channel, data) {
            if (conn.readyState != 1) {
                eventEmitter.removeListener(channel, listener);
                eventsListening[channel] = 0;
                return;
            }

            conn._writeEvent(channel, data);
        };

        var eventsListening = {};

        var registerListener = function (channel) {
            if (!eventsListening[channel])
                eventsListening[channel] = 0;
            eventsListening[channel]++;
            if (eventsListening[channel] == 1)
                eventEmitter.addListener(channel, listener);
        };
        var unregisterListener = function (channel) {
            eventsListening[channel]--;
            if (eventsListening[channel] == 0)
                eventEmitter.removeListener(channel, listener);
        };

        var user = null;

        conn.write('time ' + new Date().getTime());
        conn.write('protocol ' + PROTOCOL);

        conn.on('data', function (message) {

            if (m = message.match(/^subscribe (.*)$/)) {
                socketModules.forEach(socketMod => {
                    try {
                        if (socketMod.onSubscribe(m[1], user, conn)) {
                            registerListener(m[1]);
                        }
                    }
                    catch (e) {
                        console.error(e);
                    }
                });
            }
            if (m = message.match(/^unsubscribe (.*)$/)) {
                socketModules.forEach(socketMod => {
                    try {
                        socketMod.onUnsubscribe && socketMod.onUnsubscribe(m[1], user, conn);
                    }
                    catch (e) {
                        console.error(e);
                    }
                });
                unregisterListener(m[1]);
            }

            if (m = message.match(/^auth (.*)$/)) {

                authlib.checkToken(m[1])
                .then((_user) => {
                    user = _user;
                    env.set(env.keys.USER_ONLINE+user._id, Date.now());
                    return authlib.genToken(user._id);
                })
                .then((token) => {
                    conn.write('auth ok ' + token);
                })
                .catch(() => conn.write('auth failed'));
            }

            if (message == 'gzip on') {
                gzip = true;
            }

            if (message == 'gzip off') {
                gzip = false;
            }
        });
        conn.on('close', function () {
            for (var i in eventsListening)
                eventEmitter.removeListener(i, listener);
        });
    });

    socketServer.installHandlers(server, {prefix: '/socket'});

    /**
     * Modules
     */

    function emit(channel, data) {
        eventEmitter.emit(channel, channel, data);
    }

    var regexps = [];

    function listen(regexp, fn) {
        regexps.push({
            regexp, fn: function (data, match) {
                try {
                    fn(data, match);
                }
                catch (e) {
                    console.error(e);
                }
            }
        });
    }

    pubsub.subscribe('*', function(data) {
        var match;
        regexps.forEach((i) => {
            if (match = i.regexp.exec(this.channel)) {
                i.fn(data, match);
            }
        })
    });

    socketModules = _.values(config.backend.socketModules).map(i => i(listen, emit));
};