"use strict"
const { Transform } = require('stream')
const { createSerializer } = require('./serialize')
// a readable stream for serializing a set of variables to a JSON stream
class DPackSerializeStream extends Transform {

	constructor(options) {
		// Calls the stream.Readable(options) constructor
		options = options || {}
		super(options)
		this.options = options
	}
	write(value) {
		const serializer = this.serializer || (this.serializer = createSerializer({ asBlock: true }))
		serializer.serialize(value)
		const buffer = serializer.getSerialized()
		if (buffer.then) {
			// we need to wait for this to finish, spawn a new serializer to handle any other writes
			buffer.then(buffer => this.push(buffer))
			this.serializer = null
		} else {
			serializer.flush(this)

		}
	}
	writeFlush() {
		this.serializer.flush()
		var hasMoreToSend = this.serializer.pendingEncodings.length > 0
		if (this.readableFlowing && hasMoreToSend) {
			this._read()
		} else if (this.endWhenDone && !hasMoreToSend) {
			this.push(']')
			this.push(null)
		}
	}

	end(value) {
		if (value) {
			this.options.outlet = this
			const serializer = this.serializer || (this.serializer = createSerializer(this.options))
			serializer.serialize(value) // we do not need to write the last value as a block, its state won't affect anything afterwards
		}
		if (this.serializer.pendingEncodings.length > 0) {
			this.endWhenDone = true
		} else {
			this.serializer.flush()
			this.push(null)
		}
	}

	writeBytes(buffer) {
		this._writing = true
		try {
			this.push(buffer)
		} catch(error) {
			throw error
		}
		this._writing = false
	}

	_read() {
		if(!this._writing && this.serializer && this.endWhenDone && this.serializer.pendingEncodings.length > 0) {
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
