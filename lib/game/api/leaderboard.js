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


router.get('/list', jsonResponse((request) => {
    // TODO
    return {list: [], count: 0, users: {}};
}));

router.get('/find', jsonResponse((request) => {
    // TODO
    if(request.query.season) {
        return q.reject('result not found');
    }
    else {
        return {list: []};
    }

}));

router.get('/seasons', jsonResponse(() => {
    return {seasons: [{_id: 'empty1', name: '—'}, {_id: 'empty2', name: '—'}]};
}));



module.exports = router;