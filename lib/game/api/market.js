var express = require('express'),
    router = express.Router(),
    q = require('q'),
    _ = require('lodash'),
    jsonResponse = require('q-json-response'),
    auth = require('./auth'),
    utils = require('../../utils'),
    common = require('@screeps/common'),
    db = common.storage.db,
    env = common.storage.env,
    C = common.configManager.config.common.constants;


router.get('/orders-index', auth.tokenAuth, jsonResponse(() => {
    return db['market.orders'].find({active: true})
        .then(data => {
            var result = _.countBy(data, 'resourceType');
            return {list: _.pairs(result).map(i => ({_id: i[0], count: i[1]}))};
        })
}));

router.get('/orders', auth.tokenAuth, jsonResponse((request) => {
    return db['market.orders'].find({$and: [{active: true}, {resourceType: request.query.resourceType}]})
        .then(list => {
            list.forEach(i => i.price /= 1000);
            return {list};
        })
}));

router.get('/my-orders', auth.tokenAuth, jsonResponse((request) => {
    return db['market.orders'].find({user: request.user._id})
        .then(list => {
            list.forEach(i => i.price /= 1000);
            return {list};
        })
}));

router.get('/stats', auth.tokenAuth, jsonResponse((request) => {
    return db['market.stats'].findEx({resourceType: request.query.resourceType}, {sort: {date: -1}})
    .then(data => ({stats: data}))
}));



module.exports = router;