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
        .then((data = []) => {
            const list = {};

            data.forEach(({ resourceType, type }) => {
                list[resourceType] = list[resourceType] || {
                    _id: resourceType,
                    count: 0,
                    buying: 0,
                    selling: 0
                };

                type === 'buy' && list[resourceType].buying++;
                type === 'sell' && list[resourceType].selling++;

                list[resourceType].count++;
            })

            return { list: Object.values(list) };
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