var when = require('when');
var assign = require('lodash/object/assign');
var serverRequire = require;//hide some of the requires from lasso

module.exports = {

    bus: null,
    config: null,
    logFactory: null,

    ready: function() {
        this.config = this.config || {};
        if (this.bus) {
            return this.bus.register({
                run: this.run.bind(this)
            });
        }
    },

    loadImpl: function(implementation, config) {
        if (typeof implementation === 'string') {
            implementation = require(implementation);
        }

        var ports = implementation.ports;
        config = config || {};
        this.bus.config = config;

        if (implementation.modules instanceof Object) {
            Object.keys(implementation.modules).forEach(function(moduleName) {
                var module = implementation.modules[moduleName];
                (module.init instanceof Function) && (module.init(this.bus));
                this.bus.registerLocal(module, moduleName);
            }.bind(this));
        }

        if (implementation.validations instanceof Object) {
            Object.keys(implementation.validations).forEach(function(validationName) {
                var module = implementation.modules[validationName];
                var validation = implementation.validations[validationName];
                module && Object.keys(validation).forEach(function(value) {
                    assign(module[value], validation[value]);
                });
            });
        }

        return when.all(
            ports.reduce(function(all, port) {
                all.push(this.loadConfig(assign(port, config[port.id])));
                return all;
            }.bind(this), [])
        ).then(function(contexts) {
            return when.reduce(contexts, function(prev, context) {
                return context.port.start();
            }, []).then(function() {
                return ports;
            });
        });
    },

    loadConfig: function(config) {
        var Port = (config.createPort instanceof Function) ? config.createPort : require('ut-port-' + config.type);
        var port = new Port();
        port.bus = this.bus;
        port.logFactory = this.logFactory;
        assign(port.config, config);
        return when(port.init()).then(function() {
            return {port: port};
        });
    },

    run: function() {
        if (process.type === 'browser') {
            serverRequire('ut-front/electron')({main: module.parent.filename});
        } else {
            if (!process.browser) {
                serverRequire('babel-core/register')({
                    extensions: ['.jsx']
                });
            }

            var config = {params: {}};
            var argv = require('minimist')(process.argv.slice(2));
            config.params.app = process.env.UT_APP || argv._[0] || 'server';
            config.params.method = process.env.UT_METHOD || argv._[1] || 'debug';
            config.params.env = process.env.UT_ENV || argv._[2] || 'dev';
            config = Object.assign(config, module.parent.require('./' + config.params.app + '/' + config.params.env + '.json'));
            var main = module.parent.require('./' + config.params.app);

            if (config.cluster && config.masterBus && config.masterBus.socket && config.masterBus.socket.port) {
                var cluster = serverRequire('cluster');
                if (cluster.isMaster) {
                    var workerCount = config.cluster.workers || require('os').cpus().length;
                    for (var i = 0; i < workerCount; i += 1) {
                        cluster.fork();
                    }
                    return true;
                } else {
                    config.masterBus.socket.port = config.masterBus.socket.port + cluster.worker.id;
                    config.console && config.console.port && (config.console.port = config.console.port + cluster.worker.id);
                }
            }
            return require('ut-run/' + config.params.method).start(main, config);
        }
    }

};
