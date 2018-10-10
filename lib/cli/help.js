var common = require('@screeps/common');

var help = `The supported commands are:\r
    * help() - Print this help text.\r
    * print(value) - Print a value to the console.\r
    * storage - A global database storage object.\r
    * map - Map editing functions.\r
    * bots - Manage NPC bot players and their AI scripts.\r
    * strongholds - Manage NPC Strongholds\r
    * system - System utility functions.\r
Type help(object) to learn more about specific usage of the object.`;

var storageHelp = {
    main: `This is the main storage object that allows to perform direct operations on the game database. It contains 3 sub-objects:\r
    * db - An object containing all database collections in it. Use it to fetch or modify game objects. The database is based on LokiJS project, so you can learn more about available functionality in its documentation.
    * env - A simple key-value storage with an interface based on Redis syntax.\r
    * pubsub - A Pub/Sub mechanism allowing to publish events across all processes.`,
    db: `Database collections: \r
${Object.keys(common.storage.db).map(i => ' - '+i).join('\r\n')}\r
Available methods: \r
${Object.keys(common.storage.db.users).map(i => ' - '+i).join('\r\n')}\r
Example: storage.db.users.findOne({username: 'User1'}).then(print);`,
    env: `Keys ('storage.env.keys' object): \r
${Object.keys(common.storage.env.keys).map(i => ' - '+i).join('\r\n')}\r    
Available methods:\r
 - get\r
 - mget\r
 - set\r
 - setex\r
 - expire\r
 - ttl\r
 - del\r
 - hmset\r
Example: storage.env.get(storage.env.keys.GAMETIME).then(print);`,
    pubsub: `Keys ('storage.pubsub.keys' object): \r
${Object.keys(common.storage.pubsub.keys).map(i => ' - '+i).join('\r\n')}\r    
Available methods:\r
 - publish\r
 - subscribe\r
Example: storage.pubsub.subscribe(storage.pubsub.keys.ROOMS_DONE, (gameTime) => print(gameTime));`
};



function helpFn(object) {
    if(object === undefined) {
        return help;
    }
    if(object === this.storage) {
        return storageHelp.main;
    }
    if(object === this.storage.db) {
        return storageHelp.db;
    }
    if(object === this.storage.env) {
        return storageHelp.env;
    }
    if(object === this.storage.pubsub) {
        return storageHelp.pubsub;
    }
    if(object._help) {
        return object._help;
    }
    return 'There is no help page for this object.';
}

module.exports = function cliHelp(sandbox) {
    sandbox.help = helpFn.bind(sandbox);
};
