var q = require('q'),
    _ = require('lodash'),
    utils = require('../../utils'),
    common = require('@screeps/common'),
    config = common.configManager.config.backend,
    db = common.storage.db,
    env = common.storage.env;

const USER_LIMIT = 2;

const roomBuiltinUsers = {
    '2': {_id: '2', username: 'Invader'},
    '3': {_id: '3', username: 'Source Keeper'}
};

module.exports = function(listen, emit) {

    var connectedToRooms = {}, m;

    let usersLimit = {};

    listen(/^roomsDone$/, _.throttle(() => {

        usersLimit = {};

        var roomNames = _.shuffle(_.keys(connectedToRooms));

        roomNames.forEach(roomName => {

            if(connectedToRooms[roomName].length > 0) {

                var skip = true;

                connectedToRooms[roomName].forEach((i) => {
                    usersLimit[i.user._id] = usersLimit[i.user._id] || 0;
                    usersLimit[i.user._id]++;
                    if (usersLimit[i.user._id] > USER_LIMIT) {
                        i._skip = true;
                        i.conn._writeEvent(`err@room:${roomName}`, 'subscribe limit reached');
                        return;
                    }
                    else {
                        i._skip = false;
                        skip = false;
                    }
                });

                if(skip) {
                    return;
                }

                var startTime = Date.now();

                let promises = [
                    db['rooms.objects'].find({room: roomName}),
                    common.getGametime(),
                    db['rooms.flags'].find({room: roomName})
                ];

                q.all(promises).then(function(result) {

                    let roomObjects = result[0],
                        gameTime = parseInt(result[1]),
                        flags = result[2];

                    connectedToRooms[roomName].forEach((i) => {

                        if(i._skip) {
                            return;
                        }

                        let userFlagsData = _.find(flags, {user: ""+i.user._id});

                        let eventResult = {
                            objects: common.getDiff(i.objects, roomObjects),
                            flags: userFlagsData && userFlagsData.data,
                            gameTime
                        };

                        let eventResultPromises = [
                            env.mget([
                                env.keys.ROOM_VISUAL+`${i.user._id},,${gameTime-1}`,
                                env.keys.ROOM_VISUAL+`${i.user._id},${roomName},${gameTime-1}`
                            ]).then(data => {
                                eventResult.visual = "";
                                if(data[0]) {
                                    eventResult.visual += data[0];
                                }
                                if(data[1]) {
                                    eventResult.visual += data[1];
                                }
                            })
                        ];

                        i.objects = roomObjects;

                        let unknownUserIds = [];
                        roomObjects.forEach((object) => {
                            if(object.user && !i.users[object.user]) {
                                unknownUserIds.push(object.user);
                            }
                            if(object.reservation && !i.users[object.reservation.user]) {
                                unknownUserIds.push(object.reservation.user);
                            }
                            if(object.sign && !i.users[object.sign.user]) {
                                unknownUserIds.push(object.sign.user);
                            }
                        });
                        if(unknownUserIds.length) {

                            unknownUserIds = _.uniq(unknownUserIds);

                            eventResultPromises.push(
                                db.users.find({_id: {$in: unknownUserIds}},{ username: true, badge: true })
                                    .then((unknownUsers) => {
                                        unknownUsers.forEach((user) => i.users[user._id.toString()] = user);
                                        unknownUsers = _.reduce(unknownUsers, (result, user) => {
                                            result[user._id.toString()] = user;
                                            return result;
                                        }, {});
                                        eventResult.users = unknownUsers;
                                    })
                            );
                        }

                        if(/^(W|E)\d+(N|S)\d+$/.test(roomName)) {
                            eventResult.info = {
                                mode: 'world'
                            };
                        }

                        q.all(eventResultPromises).then(() => {
                            i.conn._writeEvent(`room:${roomName}`, eventResult);
                        });
                    });
                });
            }
        });
    }, config.socketUpdateThrottle));

    return {
        onSubscribe(channel, user, conn) {

            if(!user) {
                return false;
            }

            if(m = channel.match(/^room:([a-zA-Z0-9_-]+)$/)) {

                let roomName = m[1], roomObjects;

                db.rooms.findOne({_id: roomName})
                    .then((data) => {
                        if(!data) {
                            return q.reject('invalid room');
                        }

                        if(usersLimit[user._id] > USER_LIMIT) {
                            connectedToRooms[roomName] = connectedToRooms[roomName] || [];
                            connectedToRooms[roomName].push({
                                conn,
                                user,
                                objects: [],
                                users: _.cloneDeep(roomBuiltinUsers)
                            });
                            conn._writeEvent(`err@room:${roomName}`, 'subscribe limit reached');
                            return q.reject();
                        }
                    })
                    .then(() => db['rooms.objects'].find({room: roomName}))

                    .then((_roomObjects) => {
                        roomObjects = _roomObjects;
                        var userIds = _.reduce(roomObjects, (result, object) => {
                            if (object.user && object.user != '2' && object.user != '3') {
                                result.push(object.user);
                            }
                            return result;
                        }, []);
                        userIds = _.uniq(userIds);
                        return q.all([
                            db.users.find({_id: {$in: userIds}},{ username: true, badge: true }),
                            db['rooms.flags'].findOne({$and: [{room: roomName}, {user: ""+user._id}]})
                        ]);
                    })
                    .then((result) => {
                        let roomUsers = _.reduce(result[0], (result, i) => {
                            result[i._id.toString()] = i;
                            return result;
                        }, {});

                        let roomFlags = result[1];

                        _.extend(roomUsers, roomBuiltinUsers);

                        connectedToRooms[roomName] = connectedToRooms[roomName] || [];
                        connectedToRooms[roomName].push({
                            conn,
                            user,
                            objects: roomObjects,
                            users: roomUsers
                        });
                        conn._writeEvent(`room:${roomName}`, {
                            objects: common.getDiff([], roomObjects),
                            users: roomUsers,
                            flags: roomFlags && roomFlags.data,
                            info: {mode: 'world'}
                        });
                    })
                    .catch(console.error);

                conn.on('close', () => {
                    if(connectedToRooms[roomName]) {
                        _.remove(connectedToRooms[roomName], (i) => i.conn === conn);
                    }
                });

                return true;
            }

            return false;
        },

        onUnsubscribe(channel, user, conn) {

            if(m = channel.match(/^room:([a-zA-Z0-9_-]+)$/)) {
                if(connectedToRooms[m[1]]) {
                    _.remove(connectedToRooms[m[1]], (i) => i.conn === conn);
                }
            }
        }
    };


};