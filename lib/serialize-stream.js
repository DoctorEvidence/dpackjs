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
		this.continueWriting = true
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

	end(value) {
		if (value) {
			this.options.outlet = this
			const serializer = this.serializer || (this.serializer = createSerializer(this.options))
			serializer.serialize(value) // we do not need to write the last value as a block, its state won't affect anything afterwards
		}
		if (this.serializer.pendingEncodings.length > 0) {
			this.endWhenDone = true
			this.writeNext()
		} else {
			this.serializer.flush()
			this.push(null)
		}
	}

	writeBytes(buffer) {
		try {
			this.continueWriting = this.push(buffer)
		} catch(error) {
			throw error
		}
	}

	_read() {
		this.continueWriting = true
		if(!this.pausedForPromise && this.serializer && this.endWhenDone && this.serializer.pendingEncodings.length > 0) {
			this.writeNext()
		}
	}
	writeNext() {
		var isSync
		do {
			var hasMoreToSend = this.serializer.pendingEncodings.length > 0
			isSync = null
			if (hasMoreToSend) {
				this.serializer.pendingEncodings.shift().then(() => {
					if (isSync === false) {
						// if we are async, call writeNext which will look for more pending encodings
						this.pausedForPromise = false
						if (this.continueWriting || this.serializer.pendingEncodings.length === 0)
							this.writeNext()
						else { // backpressure, flush and wait for flow
							this.serializer.flush() // flush what we have before waiting for _read call
						}
					} else {
						// mark it as sync so we can exit and loop instead of recursing
						isSync = true
					}
				}, (error) => {
					// the serializer should handle promise errors, but if that fails, end the stream with the error
					console.error(error)
					this.push(error.toString())
					this.push(null)
				})
				if (!isSync) { // async promise, flush what we have and wait for promise
					isSync = false
					// flush what we have so far while waiting for the promise
					this.pausedForPromise = true
					this.serializer.flush()
				} else if (!this.continueWriting && this.serializer.pendingEncodings.length > 0) {
					this.serializer.flush() // flush what we have
					return
				}
			} else if (this.endWhenDone) {
				this.serializer.flush()
				this.push(']')
				this.push(null)
			}
		} while (isSync)
	}
}

exports.createSerializeStream = () => {
	return new DPackSerializeStream()
}
