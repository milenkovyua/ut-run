var when = require('when');
var assign = require('lodash/object/assign');

module.exports = {

    bus:null,
    config:null,
    logFactory:null,

    ready:function() {
        this.config = this.config || {};
        if (this.bus) {
            return this.bus.register({
                run:this.run.bind(this),
            });
        }
    },

    loadImpl:function(implementation, config) {
        if (typeof implementation === 'string') {
            implementation = require (implementation);
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
            Object.keys(implementation.validations).forEach(function (validationName) {
                var module = implementation.modules[validationName];
                var validation = implementation.validations[validationName];
                module && Object.keys(validation).forEach(function (value) {
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
                contexts.forEach(function(context) {
                    context.port.start();
                });
                return ports;
            }
        )
    },

    loadConfig:function(config) {
        var Port = (config.createPort instanceof Function) ? config.createPort : require('ut-port-' + config.type);
        var port = new Port()
        port.bus = this.bus;
        port.logFactory = this.logFactory;
        assign(port.config, config);
        return when(port.init()).then(function(){
            return {port:port};
        })
    },

    run:function() {
    }

};
