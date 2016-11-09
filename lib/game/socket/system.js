var q = require('q'),
    _ = require('lodash'),
    utils = require('../../utils');

module.exports = function(listen, emit) {

    listen(/^serverMessage$/, (e) => {
        emit('server-message', e);
    });

    return {
        onSubscribe(channel, user, conn) {

            if(channel == 'server-message') {
                return true;
            }

            return false;
        },

        onUnsubscribe(channel, user, conn) {

        }
    };


};

