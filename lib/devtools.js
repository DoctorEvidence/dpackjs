var bufferSymbol = require('./Block').bufferSymbol
var targetSymbol = require('./Block').targetSymbol
exports.default = function() {
	var g = typeof global != 'undefined' ? global : window;
	(g.devtoolsFormatters || (g.devtoolsFormatters = [])).push({
		header(block, config) {
			if (block && block[targetSymbol]) {
				return ['span', {}, 'Block', ['object', { object: block.valueOf() }]]
			}
			return null // ignore all other objects
		},
		hasBody(request) {
			return true // default
		},
		body(block) {
			var target = block[targetSymbol]
			var properties = ['div', {}]
			for (var key in target) {
				properties.push(['div', {}, ['object', { object: target[key] || {} }], key.toString()])
			}
			return properties
		}
	})
}
