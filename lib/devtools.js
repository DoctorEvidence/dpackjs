var bufferSymbol = require('./Block').bufferSymbol
var parsedSymbol = require('./Block').parsedSymbol
exports.default = function() {
	var g = typeof global != 'undefined' ? global : window;
	(g.devtoolsFormatters || (g.devtoolsFormatters = [])).push({
		header(block, config) {
			if (block && block[parsedSymbol]) {
				return ['span', {}, 'Block', ['object', { object: block.valueOf() }]]
			}
			return null // ignore all other objects
		},
		hasBody(request) {
			return true // default
		},
		body(block) {
			var buffer = block[bufferSymbol]
			var properties = ['div', {},
				['div', {}, ['object', { object: block[bufferSymbol] || {} }], '(Buffer ' + buffer.length + 'bytes)'],
				['div', {}, ['object', { object: block[parsedSymbol] || {} }], '(value)']]
			return properties
		}
	})
}
