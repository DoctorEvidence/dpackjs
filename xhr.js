var createDecoder = require('./lib/decode').createDecoder

exports.DecodedXMLHttpRequest = function() {
    var xhr = new XMLHttpRequest()
    var whenProgressDecoded
    var decoder
    xhr.addEventListener('progress', function(event) {
    	var sourceText = xhr.responseText
    	if (!decoder) {
    		if (sourceText && /dpack/.test(xhr.getResponseHeader('Content-Type'))) {
	    		decoder = createDecoder()
    		}
	    	else
	    		return
    	}
    	if (decoder.onResume) {
    		decoder.onResume(sourceText)
    		whenProgressDecoded.then(function(value) {
    			xhr.responseDecoded = value // completed successfully
    		}, onError)
    	}
		try {
			xhr.responseDecoded = decoder.decode(sourceText)
		} catch (error) {
			onError(error)
		}
		function onError(error) {
			if (error.message == 'BUFFER_SHORTAGE') {
				whenProgressDecoded = error.whenResumed
				xhr.responseDecoded = error.valueInProgress
			} else {
				throw error
			}
		}
    })
    return xhr
}
