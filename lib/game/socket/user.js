var q = require('q'),
    _ = require('lodash'),
    utils = require('../../utils'),
    common = require('@screeps/common'),
    config = common.configManager.config.backend,
    db = common.storage.db,
    env = common.storage.env;

module.exports = function(listen, emit) {

    var connectedToMemory = {}, connectedToResources = {}, connectedToMapVisual = {};

    listen(/^user:(.+)\/code$/, (data, match) => {
        data = JSON.parse(data);
        db['users.code'].findOne({_id: data.id})
            .then((codeData) => {
                emit(match[0], {
                    branch: codeData.branch,
                    modules: utils.translateModulesFromDb(codeData.modules),
                    timestamp: codeData.timestamp,
                    hash: data.hash
                });
            })
    });



    listen(/^user:(.+)\/console$/, (data, match) => {
        data = JSON.parse(data);
        delete data.userId;

        emit(match[0], data);
    });

    listen(/^user:(.+)\/cpu$/, _.throttle((data, match) => {
        emit(match[0], JSON.parse(data));
    }, config.socketUpdateThrottle));

    listen(/^user:(.+)\/set-active-branch$/, (data, match) => {
        emit(match[0], JSON.parse(data));
    });

    listen(/^user:(.+)\/message:(.*)$/, (data, match) => {
        emit(match[0], JSON.parse(data));
    });

    listen(/^user:(.+)\/newMessage$/, (data, match) => {
        emit(match[0], JSON.parse(data));
    });

    listen(/^roomsDone$/, _.throttle(() => {
        _.forEach(connectedToMemory, (memoryPaths, userId) => {
            var startTime = Date.now();
            env.get(env.keys.MEMORY+userId)
                .then((data) => {
                    if(data) {
                        var memory = JSON.parse(data),
                            cnt = 0;
                        _.forEach(memoryPaths, (conns, memoryPath) => {
                            cnt++;
                            if(cnt > 50) {
                                return;
                            }

                            var result;
                            try {
                                var curPointer = memory,
                                    parts = memoryPath.split(/\./);

                                do {
                                    curPointer = curPointer[parts.shift()];
                                }
                                while (parts.length > 0);
                                result = ""+curPointer;
                            }
                            catch (e) {
                                result = 'Incorrect memory path';
                            }

                            conns.forEach((conn) => conn._writeEvent(`user:${userId}/memory/${memoryPath}`, result));
                        });
                    }
                });
        });

        if(_.size(connectedToResources)) {
            db.users.find({_id: {$in: Object.keys(connectedToResources)}})
            .then(userResources => {
                var usersResourcesById = _.indexBy(userResources, '_id');
                _.forEach(connectedToResources, (conns, userId) => {
                    const resources = _.merge({}, usersResourcesById[userId].resources, {credits: (usersResourcesById[userId].money || 0)/1000});
                    conns.forEach(conn => conn._writeEvent(`user:${userId}/resources`, resources));
                });
            });
        }

        _.forEach(connectedToMapVisual, async (conns, userId) => {
            if(!conns.length) {
                return;
            }
            const gameTime = await common.getGametime();
            const data = await env.get(`${env.keys.ROOM_VISUAL}${userId},map,${gameTime-1}`);
            conns.forEach(conn => conn._writeEvent(`mapVisual:${userId}`, data));
        });
    }, config.socketUpdateThrottle));

    return {
        async onSubscribe(channel, user, conn) {

            var m;

            if(m = channel.match(/^user:(.+)\/memory\/(.+)$/)) {

                let userId = m[1], memoryPath = m[2];

                if(!user || user._id != userId) {
                    return false;
                }

                connectedToMemory[userId] = connectedToMemory[userId] || {};
                connectedToMemory[userId][memoryPath] = connectedToMemory[userId][memoryPath] || [];
                connectedToMemory[userId][memoryPath].push(conn);

                conn.on('close', () => {
                    if(connectedToMemory[userId] && connectedToMemory[userId][memoryPath]) {
                        _.remove(connectedToMemory[userId][memoryPath], (i) => i === conn);
                    }
                });
                return true;
            }

            if(m = channel.match(/^user:(.+)\//)) {
                var result = user && user._id == m[1];

                if(result && /^user:.+\/cpu$/.test(channel)) {
                    env.get(env.keys.MEMORY+user._id)
                        .then((data) => {
                            if(data) {
                                emit(channel, {cpu: 0, memory: data.length});
                            }
                        })
                }

                if(result && /^user:.+\/resources$/.test(channel)) {
                    connectedToResources[user._id] = connectedToResources[user._id] || [];
                    connectedToResources[user._id].push(conn);
                    conn.on('close', () => {
                        if(connectedToResources[user._id]) {
                            _.remove(connectedToResources[user._id], (i) => i === conn);
                        }
                    });
                }

                return result;
            }

            if(m = channel.match(/^mapVisual:(.+)$/)) {
                const userId = m[1]

                if(!user || user._id != userId) {
                    return false;
                }

                connectedToMapVisual[user._id] = connectedToMapVisual[user._id] || [];
                connectedToMapVisual[user._id].push(conn);

                conn.on('close', () => {
                    if(connectedToMapVisual[user._id]) {
                        _.remove(connectedToMapVisual[user._id], i => i === conn);
                    }
                });

                const gameTime = await common.getGametime();
                const data = await env.get(`${env.keys.ROOM_VISUAL}${userId},map,${gameTime-1}`);
                emit(channel, data);

                return true;
            }

            return false;
        },

        onUnsubscribe(channel, user, conn) {

            var m;
            if(m = channel.match(/^user:(.+)\/memory\/(.+)$/)) {
                if(connectedToMemory[m[1]] && connectedToMemory[m[1]][m[2]]) {
                    _.remove(connectedToMemory[m[1]][m[2]], (i) => i === conn);
                }
            }

            if(m = channel.match(/^user:(.+)\/resources$/)) {
                if(connectedToResources[m[1]]) {
                    _.remove(connectedToResources[m[1]], (i) => i === conn);
                }
            }

            if(m = channel.match(/^mapVisual:(.+)$/)) {
                if(connectedToMapVisual[m[1]]) {
                    _.remove(connectedToMapVisual[m[1]], i => i === conn);
                }
            }
        }
    };
};
