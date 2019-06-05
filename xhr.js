"use strict"
var createParser = require('./lib/parse').createParser

exports.XMLHttpRequest = function() {
	var xhr = new XMLHttpRequest()
	var parser
	var responseResolve
	var responseRejected
   	var requestResolved
	xhr.addEventListener('progress', receivedData)
	var acceptSet
	var originalSetRequestHeader = xhr.setRequestHeader
	var lastOffset = 0
	xhr.setRequestHeader = function(name, value) {
		if (name.toLowerCase() == 'accept')
			acceptSet = true
		return originalSetRequestHeader.call(this, name, value)
	}
	var originalSend = xhr.send
	xhr.send = function() {
		if (!acceptSet)
			this.setRequestHeader('Accept', 'text/dpack;q=1,application/json;q=0.7')
		originalSend.apply(this, arguments)
	}

	function receivedData(event) {
		var sourceText = xhr.responseText
		try {
			if (parser) {
				if (parser.onResume) {
					var updatedData = parser.onResume(sourceText.slice(lastOffset), true, true)
					xhr.responseParsed = xhr.responseParsed || updatedData
				}
			} else {
				if (sourceText && /dpack/.test(xhr.getResponseHeader('Content-Type'))) {
					parser = createParser()
					parser.setSource(sourceText, 0, true)
					xhr.responseParsed = parser.read()
				}
				else
					return
			}
			lastOffset = sourceText.length
		} catch (error) {
			if (xhr.onerror) {
				xhr.onerror(error)
			} else {
				throw error
			}
		}
	}
	xhr.addEventListener('load', function(event) {
		receivedData()
		if (parser && parser.isPaused()) {
			throw new Error('Unexpected end of dpack stream')
		}
	})
	return xhr
}
