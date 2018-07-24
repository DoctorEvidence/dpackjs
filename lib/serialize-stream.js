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
			this.serializer.pendingEncodings.shift().then(() => this.writeFlush())
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
		this.push(buffer)
		this._writing = false
	}

	_read() {
		if(!this._writing && this.serializer.pendingEncodings.length > 0) {
			this.serializer.pendingEncodings.shift().then(() => this.writeFlush())
		}
	}
}

exports.createSerializeStream = () => {
	return new DPackSerializeStream()
}
