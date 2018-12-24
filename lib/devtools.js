var bufferSymbol = require('./Block').bufferSymbol
exports.default = function() {
	var g = typeof global != 'undefined' ? global : window
	(g.devtoolsFormatters || (g.devtoolsFormatters = [])).push({
		header(block, config) {
			if (block && block[bufferSymbol]) {
				return ['span', {}, ['object', { object: block.valueOf() }]]
			}
			return null // ignore all other objects
		},
		hasBody(request) {
			if (request && request.__isLoggedRequest) {
				return true
			}
			return true // default
		},
		body(request) {
			var properties = ['ul', {},
				['li', {}, ['object', { object: request.headers || {} }], '(Headers)']]
			if (request.requestData)
				properties.push(['li', {}, ['object', { object: request.requestData }], '(Request)'])
			if (request.responseData)
				properties.push(['li', {}, ['object', { object: request.responseData }], '(Response)'])
			if (request.xhr)
				properties.push(['li', {}, ['object', { object: request.xhr }], '(XHR)'])
			return properties
		}
	})
}
