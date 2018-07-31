"use strict"
var { Transform } = require('stream')
var { createSerializer } = require('./serialize')
// a readable stream for serializing a set of variables to a JSON stream
class DPackSerializeStream extends Transform {

	constructor(options) {
		// Calls the stream.Readable(options) constructor
		options = options || {}
		super(options)
		options.outlet = this
		this.serializer = createSerializer(options)
	}
	write(value) {
		this.serializer.serialize(value)
		this.writeFlush()
	}
	writeFlush() {
		this.serializer.flush()
		var hasMoreToSend = this.serializer.pendingEncodings.length > 0
		if (this.readableFlowing && hasMoreToSend) {
			this._read()
		} else if (this.endWhenDone && !hasMoreToSend) {
			this.push(null)
		}
	}

	end(value) {
		if (value) {
			this.write(value)
		}
		if (this.serializer.pendingEncodings.length > 0) {
			this.endWhenDone = true
		} else {
			this.push(null)
		}
	}

	writeBytes(buffer, onResume) {
		this._writing = true
		try {
			this.push(buffer)
		} catch(error) {
			console.error('Stream state for error', this)
			throw error
		}
		this._writing = false
	}

	_read() {
		if(!this._writing && this.serializer.pendingEncodings.length > 0) {
			this._writing = true
			this.serializer.pendingEncodings.shift().then(() => {
				this._writing = false
				this.writeFlush()
			}, (error) => {
				console.error(error)
				this.push(error.toString())
			})
		}
	}
}

exports.createSerializeStream = () => {
	return new DPackSerializeStream()
}
