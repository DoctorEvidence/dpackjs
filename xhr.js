"use strict"
var createParser = require('./lib/parse').createParser

exports.XMLHttpRequest = function() {
	var xhr = new XMLHttpRequest()
	var parser
	var responseResolve
	var responseRejected
   	var requestResolved
	xhr.addEventListener('progress', receivedData)
	xhr.open = function() {
		XMLHttpRequest.prototype.open.apply(this, arguments)
		this.setRequestHeader('Accept', 'text/dpack;q=1,application/json;q=0.7')
	}

	function receivedData(event) {
		var sourceText = xhr.responseText
		try {
			if (parser) {
				if (parser.onResume) {
					var updatedData = parser.onResume(sourceText)
					xhr.responseParsed = xhr.responseParsed || updatedData
				}
			} else {
				if (sourceText && /dpack/.test(xhr.getResponseHeader('Content-Type'))) {
					parser = createParser()
					parser.setSource(sourceText)
					xhr.responseParsed = parser.read()
				}
				else
					return
			}
			parser.read()
		} catch (error) {
			onError(error)
		}
	}
	function onError(error) {
		if (error.message == 'Unexpected end of dpack stream') {
			xhr.responseParsed = xhr.responseParsed || error.valueInProgress
		} else {
			if (xhr.onerror) {
				xhr.onerror(error)
			} else {
				throw error
			}
		}
	}
	xhr.addEventListener('load', function(event) {
		receivedData()
	})
	return xhr
}
