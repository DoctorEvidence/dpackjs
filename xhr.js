"use strict"
var createParser = require('./lib/parse').createParser

exports.addDPackParser = function(xhr) {
	Object.defineProperty(xhr, 'responseParsed', {
		get: function() {
			var parser = this._parser || (this._parser = createParser())
			try {
				if (parser.onResume) {
					var updatedData = parser.onResume(sourceText)
					xhr.responseParsed = xhr.responseParsed || updatedData
				} else {
					parser.setSource(sourceText)
					xhr.responseParsed = parser.readOpen()
				}
				while (parser.hasUnfulfilledReferences()) {
					parser.readOpen()
				}
			} catch (error) {
				onError(error)
			}
			function onError(error) {
				if (error.message == 'Unexpected end of dpack stream') {
					xhr.responseParsed = xhr.responseParsed || error.valueInProgress
				} else {
					throw error
				}
			}
		}
	})
}
