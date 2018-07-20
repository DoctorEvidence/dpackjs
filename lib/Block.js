const { serialize } = require('./serialize')
const bufferSymbol = Symbol('buffer')
const parsedSymbol = Symbol('parsed')

function Block() {}
exports.Block = Block
exports.bufferSymbol = bufferSymbol
exports.parsedSymbol = parsedSymbol
exports.asBlock = function(object) {
	return new Proxy({
		parsed: object
	}, binaryMapped)
}
exports.makeBlockFromBuffer = function(buffer, parser) {
	return new Proxy({
		buffer: buffer,
		parser: parser
	}, binaryMapped)
}

const binaryMapped = {
	get(target, key) {
		if (specialGetters.hasOwnProperty(key)) {
			return specialGetters[key].call(target)
		}
		var parsed = target.parsed
		if (!parsed) {
			parsed = getParsed(target)
		}
		return parsed[key]
	},
	set(target, key, value) {
		if (specialSetters.hasOwnProperty(key)) {
			specialSetters[key].call(target, value)
			return true
		}
		var parsed = target.parsed
		if (!parsed) {
			parsed = getParsed(target)
		}
		// invalidate the buffer, it is no longer a valid representation
		this.buffer = null
		this.parser = null
		parsed[key] = value
		return true
	},
	getOwnPropertyDescriptor(target, key) {
		var parsed = getParsed(target)
		return Object.getOwnPropertyDescriptor(parsed, key)
	},
	has(target, key) {
		var parsed = getParsed(target)
		return key in parsed
	},
	ownKeys(target) {
		var parsed = getParsed(target)
		return Object.keys(parsed)
	}
}

const specialGetters = {
	constructor() {
		return Block
	},
	[bufferSymbol]() {
		return this.buffer || getSerialized(this)
	},
	[parsedSymbol]() {
		return this.parsed || getParsed(this)
	}
}
const specialSetters = {
	[bufferSymbol](buffer) {
		this.buffer = buffer
		this.parsed = undefined
	}
}


function getParsed(target) {
	var parsed = target.parsed
	if (parsed)
		return parsed
	var buffer = target.buffer
	var parser = target.parser
	var primaryBuffer
	var firstByte = buffer[0]
	if (firstByte === 0x4d) { // must start with a start-block for lazy evaluation
		var referenceableValues = parser.referenceableValues
		var length = parser.setSource(buffer.slice(1, 13).toString()).readOpen() // read first block as number
		var offset = parser.offset + 1
		primaryBuffer = buffer.slice(offset, offset += length)
		// now iterate through any other referable/lazy objects and declare them
		while (offset < buffer.length) {
			firstByte = buffer[offset]
			if (firstByte === 0x4e) {
				var headerString = buffer.slice(offset + 1, offset + 13).toString()
				id = parser.setSource(headerString).readOpen()
				var afterIdOffset = parser.offset
				parser.setSource(headerString, afterIdOffset + 1) // skip the begin-block token
				length = parser.readOpen()
				var nextBuffer = buffer.slice(offset + afterIdOffset + 1, offset += parser.offset + length + 1)
				referenceableValues[id] = new Proxy({
					buffer: nextBuffer,
					parser: parser
				}, binaryMapped)
			}
		}
	} else {
		primaryBuffer = buffer
	}
	return target.parsed = parser.setSource(primaryBuffer.toString(), 0).readOpen()
}

function getSerialized(target) {
	return target.buffer = serialize(target.parsed, {
		withLength: true
	})
}
serialize.Block = Block
