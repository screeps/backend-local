var express = require('express'),
    router = express.Router(),
    q = require('q'),
    _ = require('lodash'),
    jsonResponse = require('q-json-response'),
    common = require('@screeps/common'),
    auth = require('./auth'),
    db = common.storage.db,
    env = common.storage.env,
    pubsub = common.storage.pubsub;

function sendMessageNotification (userId, message) {
    return db.users.findOne({_id: userId})
        .then((user) => {
            if(user.notifyPrefs && user.notifyPrefs.disabledOnMessages) {
                return q.reject();
            }
            if(!user.notifyPrefs || !user.notifyPrefs.sendOnline) {
                return env.get(env.keys.USER_ONLINE+userId).then((data) => parseInt(data) > Date.now() - 10*60*1000 ? q.reject() : true);
            }
        })
        .then((data) => db['users.notifications'].update({$and: [
            {user: userId},
            {message},
            {date: {$lte: Date.now()}},
            {type: 'msg'}
        ]}, {
            $set: {
                user: userId,
                message,
                date: Date.now(),
                type: 'msg'
            },
            $inc: {count: 1}
        }, {upsert: true}));
};

router.post('/send', auth.tokenAuth, jsonResponse((request) => {

    if(!_.isString(request.body.text) || request.body.text.length > 100*1024) {
        return q.reject('text too long');
    }

    var outMessage = {
        user: request.user._id,
        respondent: request.body.respondent,
        date: new Date(),
        type: 'out',
        text: request.body.text,
        unread: true
    };

    var inMessage = {
        respondent: request.user._id,
        user: request.body.respondent,
        date: new Date(),
        type: 'in',
        text: request.body.text,
        unread: true
    };

    return db.users.findOne({_id: request.body.respondent})
        .then((respondent) => {
            if(!respondent) {
                return q.reject('invalid respondent');
            }
            return db['users.messages'].insert(outMessage);
        })
        .then(data => {
            outMessage = data;
            return db['users.messages'].insert(_.extend(inMessage, {outMessage: outMessage._id}))
        })
        .then(data => {
            inMessage = data;
            sendMessageNotification(request.body.respondent, '<a href="https://screeps.com/a/#!/messages">New message</a> from user '+request.user.username),
                pubsub.publish(`user:${request.user._id}/message:${request.body.respondent}`, JSON.stringify({message: outMessage}));
            pubsub.publish(`user:${request.body.respondent}/message:${request.user._id}`, JSON.stringify({message: inMessage}));
            pubsub.publish(`user:${request.body.respondent}/newMessage`, JSON.stringify({message: inMessage}));
        });
}));

router.get('/list', auth.tokenAuth, jsonResponse((request) => {

    return db['users.messages'].findEx({$and: [{user: request.user._id}, {respondent: request.query.respondent}]}, {sort: {date: -1}, limit: 100})
        .then((messages) => ({messages: messages.reverse()}));
}));

router.get('/index', auth.tokenAuth, jsonResponse((request) => {

    return db['users.messages'].findEx({user: request.user._id}, {sort: {date: -1}})
        .then(data => {
            var messages = [];
            data.forEach(message => {
                if (!_.any(messages, i => i._id == message.user)) {
                    messages.push({_id: message.user, message});
                }
            });
            return db.users.find({_id: {$in: _.pluck(messages, '_id')}})
                .then(users => {
                    users = users.map(i => _.pick(i, ['_id','username','badge']));
                    return {messages, users: _.indexBy(users, '_id')};
                });
        })
}));

router.post('/mark-read', auth.tokenAuth, jsonResponse((request) => {
    var _id = request.body.id, message;
    return db['users.messages'].findOne({$and: [{_id}, {user: request.user._id}, {type: 'in'}]})
        .then((_message) => {
            if (!_message) {
                return q.reject('invalid id');
            }
            message = _message;
            return db['users.messages'].update({_id}, {$set: {unread: false}});
        })
        .then((data) => {
            return q.all([
                pubsub.publish(`user:${message.user}/message:${message.respondent}`, JSON.stringify({message: {
                    _id: request.body.id,
                    unread: false
                }})),
                pubsub.publish(`user:${message.respondent}/message:${message.user}`, JSON.stringify({message: {
                    _id: message.outMessage,
                    unread: false
                }})),
                db['users.messages'].update({_id: message.outMessage}, {$set: {unread: false}})
            ]);
        });
}));

router.get('/unread-count', auth.tokenAuth, jsonResponse((request) => {
    return db['users.messages'].count({$and: [{user: request.user._id}, {type: 'in'}, {unread: true}]})
    .then((count) => new Object({count}));
}));


module.exports = router;