var q = require('q'),
    _ = require('lodash'),
    utils = require('../../utils'),
    common = require('@screeps/common'),
    config = common.configManager.config.backend,
    db = common.storage.db,
    env = common.storage.env;

module.exports = function(listen, emit) {

    var connectedToMemory = {}, connectedToMoney = {};

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

        if(_.size(connectedToMoney)) {
            db.users.find({_id: {$in: Object.keys(connectedToMoney)}})
            .then(usersMoney => {
                var usersMoneyById = _.indexBy(usersMoney, '_id');
                _.forEach(connectedToMoney, (conns, userId) => {
                    conns.forEach(conn => conn._writeEvent(`user:${userId}/money`, (usersMoneyById[userId].money || 0) / 1000));
                });
            });
        }
    }, config.socketUpdateThrottle));

    return {
        onSubscribe(channel, user, conn) {

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

                if(result && /^user:.+\/money$/.test(channel)) {
                    connectedToMoney[user._id] = connectedToMoney[user._id] || [];
                    connectedToMoney[user._id].push(conn);
                    conn.on('close', () => {
                        if(connectedToMoney[user._id]) {
                            _.remove(connectedToMoney[user._id], (i) => i === conn);
                        }
                    });
                }

                return result;
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

            if(m = channel.match(/^user:(.+)\/money$/)) {
                if(connectedToMoney[m[1]]) {
                    _.remove(connectedToMoney[m[1]], (i) => i === conn);
                }
            }
        }
    };
};
