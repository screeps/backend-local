const vm = require('vm');
const util = require('util');
const common = require('@screeps/common');
const config = common.configManager.config;

Object.assign(config.cli, {
    createSandbox(outputCallback) {
        if(!/at Object\.create/.test(new Error().stack.split(/\n/)[2])) {
            console.error("config.cli.createSandbox is deprecated, please use config.cli.onCliSandbox instead");
        }
        var sandbox = {
            print() {
                outputCallback(Array.prototype.slice.apply(arguments).map( i => util.inspect(i)).join(" "));
            },
            storage: common.storage,
            map: require('./map'),
            bots: require('./bots'),
            strongholds: require('./strongholds'),
            system: require('./system')
        };

        require('./help')(sandbox);

        config.cli.emit('cliSandbox',sandbox);

        return sandbox;
    }
});

function create(outputCallback) {

    const context = vm.createContext(config.cli.createSandbox(outputCallback));

    return function(command) {
        try {
            var result = vm.runInContext(command, context);
            if(result && result.then) {
                result.then(
                    data => {
                        if(data) {
                            outputCallback(util.inspect(data), true);
                        }
                    },
                    err => {
                        outputCallback("Error: "+(err.stack || err), true);
                    }
                );
            }
            else {
                outputCallback(""+result, true);
            }

        }
        catch(e) {
            outputCallback(e.toString(), true);
        }
    };
}

exports.create = create;
